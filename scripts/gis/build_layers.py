#!/usr/bin/env python3
"""Audit the supplied QTG shapefiles and export review GeoJSON for the web map.

The original shapefiles and the canonical 32-site/6-route data are read-only.
Run from the project root:
  .venv-gis/Scripts/python scripts/gis/build_layers.py --source D:/TourVanMieu/t1/t1
"""

from __future__ import annotations

import argparse
import codecs
import csv
import hashlib
import json
import logging
import math
import re
import shutil
import sys
import tempfile
import unicodedata
import warnings
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import date, datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import shapefile
from pyproj import CRS, Transformer
from shapely import get_coordinates, transform as shapely_transform
from shapely.geometry import shape


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT.parent.parent / "t1" / "t1"
TARGET_CRS = CRS.from_epsg(4326)
LAYERS = {
    "roads": {"file": "road_Clip1", "output": "roads.geojson", "geometry": "line", "expected": 1107, "map": True, "show": True},
    "water": {"file": "nuoc", "output": "water.geojson", "geometry": "polygon", "expected": 13, "map": True, "show": True},
    "railways_area": {"file": "duongtau", "output": "railways-area.geojson", "geometry": "line", "expected": 87, "map": True, "show": True},
    "railways_context": {"file": "railways", "output": "railways-context.geojson", "geometry": "line", "expected": 288, "map": True, "show": False},
    "boundary": {"file": "QTG_RanhGioi", "output": "boundary.geojson", "geometry": "polygon", "expected": 1, "map": True, "show": True},
    "boundary_supplementary": {"file": "ranhgioi", "output": "boundary-supplementary.geojson", "geometry": "line", "expected": 1, "map": True, "show": False},
    "heritage_points_review": {"file": "QTG_Diem", "output": "heritage-points-review.geojson", "geometry": "point", "expected": 35, "map": False, "show": False, "review_only": True},
}

GEOMETRY_FAMILIES = {
    "line": {"LineString", "MultiLineString"},
    "polygon": {"Polygon", "MultiPolygon"},
    "point": {"Point"},
}

SPECIAL_REVIEW_NOTES = {
    "chua ba nanh": "GIS also has a separate Tiên Phúc Tự point; compare against the PDF alias before merging.",
    "chua tien phuc tu": "The canonical list treats Tiên Phúc Tự as an alias of Chùa Bà Nành; do not auto-merge the two GIS pins.",
    "ho giam": "Compare with Hồ Văn and Gò Kim Châu in the canonical list; nearby features may be parts of one complex.",
    "go kim chau": "Compare with Hồ Văn and Hồ Giám; retain separate geometry until identity/scope is confirmed.",
    "gieng ngoc dinh trung tu": "Do not merge with Chùa Trung Tự or Đình làng Trung Tự without source confirmation.",
    "dinh lang trung tu": "Keep distinct from Chùa Trung Tự and Giếng Ngọc pending identity review.",
    "dinh kham duc": "A separate Đền Khâm Đức point is only 8.8 m away; confirm whether these are distinct sites/entrances.",
    "den kham duc tho chau de tu": "A separate Đình Khâm Đức point is only 8.8 m away; confirm whether these are distinct sites/entrances.",
    "dinh trung kinh": "Close to Chùa Mỹ Quang; preserve distinct identities and check the local-context match.",
    "chua my quang": "Close to Đình Trung Kính; preserve distinct identities and check the local-context match.",
    "y mieu": "Close to Chùa Quang Minh; preserve distinct identities.",
    "chua quang minh": "Close to Y Miếu; preserve distinct identities.",
    "chua tien tich": "Additional GIS point outside the current 32-site canonical list; do not add to the public list automatically.",
    "den duc thanh tran": "Additional GIS point outside the current 32-site canonical list; do not add automatically.",
    "gieng ngoc dinh trung tu": "Additional GIS point outside the current 32-site canonical list; do not add automatically.",
}


def normalized(value: str) -> str:
    value = value.lower().replace("đ", "d")
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    return str(value)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def check_index_files(shp_path: Path, count: int) -> dict[str, Any]:
    shp_bytes = shp_path.read_bytes()
    shx_path = shp_path.with_suffix(".shx")
    shx_bytes = shx_path.read_bytes()
    shp_declared_bytes = int.from_bytes(shp_bytes[24:28], "big") * 2
    shx_declared_bytes = int.from_bytes(shx_bytes[24:28], "big") * 2
    offsets = []
    pos = 100
    while pos + 8 <= len(shp_bytes):
        _, words = __import__("struct").unpack(">ii", shp_bytes[pos:pos + 8])
        offsets.append((pos // 2, words))
        pos += 8 + words * 2
    shx_entries = [
        __import__("struct").unpack(">ii", shx_bytes[pos:pos + 8])
        for pos in range(100, len(shx_bytes), 8)
    ]
    return {
        "shp_declared_length_matches": shp_declared_bytes == len(shp_bytes),
        "shx_declared_length_matches": shx_declared_bytes == len(shx_bytes),
        "shp_record_count": len(offsets),
        "shx_record_count": len(shx_entries),
        "shx_offsets_match_shp": offsets == shx_entries,
        "dbf_record_count": count,
    }


def source_lineage(xml_path: Path) -> list[str]:
    if not xml_path.exists():
        return []
    try:
        root = ET.parse(xml_path).getroot()
    except ET.ParseError as error:
        return [f"Metadata XML could not be parsed: {error}"]
    steps = []
    for node in root.iter():
        if node.tag.rsplit("}", 1)[-1] == "Process" and node.text:
            text = re.sub(r"(?:[A-Za-z]:\\|\\\\)[^\s#]+", "<local path>", node.text.strip())
            steps.append(text)
    return steps


def crosswalk_points(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sites_path = ROOT / "data" / "sites.json"
    sites = json.loads(sites_path.read_text(encoding="utf-8"))
    choices = []
    for site in sites:
        names = [site.get("name", ""), *site.get("aliases", [])]
        choices.extend((normalized(name), site["id"], name) for name in names if name)
    by_norm: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for name, site_id, original in choices:
        by_norm[name].append((site_id, original))

    rows = []
    for feature in features:
        name = str(feature["properties"].get("Name", ""))
        key = normalized(name)
        exact = list(dict.fromkeys(site_id for site_id, _ in by_norm.get(key, [])))
        scores = sorted(
            ((SequenceMatcher(None, key, option).ratio(), site_id, original)
             for option, site_id, original in choices), reverse=True
        )
        candidates = []
        for score, site_id, original in scores:
            if score < 0.58 or any(candidate["site_id"] == site_id for candidate in candidates):
                continue
            candidates.append({"site_id": site_id, "canonical_name": original, "name_similarity": round(score, 3)})
            if len(candidates) == 3:
                break
        notes = SPECIAL_REVIEW_NOTES.get(key, "Name similarity is a review hint, not an identity or coordinate verification.")
        rows.append({
            "gis_record": feature["id"],
            "gis_name": name,
            "exact_name_or_alias_site_ids": exact,
            "possible_name_matches": candidates,
            "identity_status": "needs_human_review",
            "public_map_status": "audit_only_not_rendered",
            "notes": notes,
        })
    return rows


def inspect_layer(layer_id: str, spec: dict[str, Any], source_dir: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    stem = spec["file"]
    shp_path = source_dir / f"{stem}.shp"
    required = [".shp", ".shx", ".dbf", ".prj"]
    absent = [ext for ext in required if not shp_path.with_suffix(ext).is_file()]
    if absent:
        raise FileNotFoundError(f"{stem}: missing required sidecar(s): {', '.join(absent)}")

    prj_text = shp_path.with_suffix(".prj").read_text(encoding="utf-8-sig").strip()
    source_crs = CRS.from_wkt(prj_text)
    transformer = Transformer.from_crs(source_crs, TARGET_CRS, always_xy=True)
    cpg_path = shp_path.with_suffix(".cpg")
    encoding = cpg_path.read_text(encoding="ascii").strip() if cpg_path.exists() else "utf-8"
    codecs.lookup(encoding)

    reader = shapefile.Reader(str(shp_path), encoding=encoding)
    field_defs = reader.fields[1:]
    field_names = [field[0] for field in field_defs]
    shape_records = reader.shapeRecords()
    records_count = len(reader.records())
    file_check = check_index_files(shp_path, records_count)
    target_geom_types = Counter()
    source_geom_types = Counter()
    duplicate_keys: dict[str, list[int]] = defaultdict(list)
    errors: list[dict[str, Any]] = []
    features: list[dict[str, Any]] = []
    aggregate = None
    property_values: dict[str, Counter[str]] = defaultdict(Counter)
    repeated_vertices = 0
    source_format_warnings: list[str] = []

    class CaptureShapefileWarning(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            message = record.getMessage()
            if message not in source_format_warnings:
                source_format_warnings.append(message)

    shapefile_warning_capture = CaptureShapefileWarning()
    shapefile.logger.addHandler(shapefile_warning_capture)

    for index, shape_record in enumerate(shape_records, start=1):
        try:
            raw_geojson = shape_record.shape.__geo_interface__
            geometry = shape(raw_geojson)
            source_geom_types[geometry.geom_type] += 1
            if geometry.is_empty:
                raise ValueError("empty geometry")
            if not geometry.is_valid:
                raise ValueError(f"invalid source geometry: {geometry.is_valid}")
            if not all(math.isfinite(float(value)) for row in get_coordinates(geometry) for value in row[:2]):
                raise ValueError("non-finite X/Y coordinate")
            coords = get_coordinates(geometry)
            if len(coords) > 1:
                repeated_vertices += sum(1 for a, b in zip(coords, coords[1:]) if a[0] == b[0] and a[1] == b[1])

            converted = shapely_transform(geometry, transformer.transform, interleaved=False)
            if converted.is_empty or not converted.is_valid:
                raise ValueError("geometry is invalid after CRS transform")
            if not all(math.isfinite(float(value)) for row in get_coordinates(converted) for value in row[:2]):
                raise ValueError("non-finite transformed X/Y coordinate")
            if any(abs(x) > 180 or abs(y) > 90 for x, y, *_ in get_coordinates(converted)):
                raise ValueError("transformed coordinate is outside WGS84 longitude/latitude bounds")

            fingerprint = converted.normalize().wkb_hex
            duplicate_keys[fingerprint].append(index)
            aggregate = converted if aggregate is None else aggregate.union(converted)
            values = [json_safe(value) for value in shape_record.record]
            properties = dict(zip(field_names, values))
            for key, value in properties.items():
                if value not in (None, ""):
                    property_values[key][str(value)] += 1
            target_geom_types[converted.geom_type] += 1
            features.append({
                "type": "Feature",
                "id": f"{stem}.{index:04d}",
                "geometry": converted.__geo_interface__,
                "properties": {
                    **properties,
                    "_source_layer": stem,
                    "_source_record": index,
                    "_review_only": spec.get("review_only", False),
                },
            })
        except Exception as error:  # Report each source record; do not repair or invent geometry.
            errors.append({"record": index, "error": f"{type(error).__name__}: {error}"})
    shapefile.logger.removeHandler(shapefile_warning_capture)

    duplicate_groups = [rows for rows in duplicate_keys.values() if len(rows) > 1]
    file_hashes = {}
    for ext in [".shp", ".shx", ".dbf", ".prj", ".cpg", ".xml"]:
        sidecar = shp_path.with_suffix(ext)
        if sidecar.is_file():
            file_hashes[sidecar.name] = sha256(sidecar)

    crs_authority = source_crs.to_authority()
    audit = {
        "id": layer_id,
        "source_file": stem,
        "output_file": spec["output"],
        "geometry_expected": spec["geometry"],
        "geometry_types_allowed": sorted(GEOMETRY_FAMILIES[spec["geometry"]]),
        "feature_count_expected_from_input": spec["expected"],
        "feature_count_read": records_count,
        "feature_count_exportable": len(features),
        "feature_count_error": len(errors),
        "feature_count_duplicate_geometry": sum(len(group) - 1 for group in duplicate_groups),
        "duplicate_geometry_record_groups": duplicate_groups,
        "consecutive_duplicate_xy_vertices": repeated_vertices,
        "source_geometry_types": dict(source_geom_types),
        "target_geometry_types": dict(target_geom_types),
        "source_crs_name": source_crs.name,
        "source_crs_authority": f"{crs_authority[0]}:{crs_authority[1]}" if crs_authority else None,
        "source_crs_wkt": source_crs.to_wkt(),
        "source_crs_is_geographic": source_crs.is_geographic,
        "target_crs": "EPSG:4326",
        "encoding": encoding,
        "fields": [{"name": field[0], "type": field[1], "width": field[2], "decimal": field[3]} for field in field_defs],
        "non_empty_attribute_value_counts": {key: dict(counter.most_common(50)) for key, counter in property_values.items()},
        "source_file_integrity": file_check,
        "source_lineage": source_lineage(shp_path.with_suffix(".xml")),
        "source_format_warnings": source_format_warnings,
        "source_hashes_sha256": file_hashes,
        "render_on_map": spec["show"],
        "errors": errors,
        "bbox_wgs84": list(aggregate.bounds) if aggregate is not None else None,
        "geometry_validity": "not checked" if errors else "all exported records pass Shapely validity and finite-coordinate checks",
    }
    for key, counter in audit["non_empty_attribute_value_counts"].items():
        if sum(counter.values()) < records_count:
            audit.setdefault("attributes_with_blank_values", []).append(key)
    return audit, features


def verify_boundary_pair(audits: dict[str, Any], feature_sets: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    polygon_features = feature_sets.get("boundary", [])
    line_features = feature_sets.get("boundary_supplementary", [])
    if not polygon_features or not line_features:
        return {"status": "not_comparable", "reason": "boundary layer is missing or invalid"}
    polygon = shape(polygon_features[0]["geometry"])
    line = shape(line_features[0]["geometry"])
    source = CRS.from_wkt(audits["boundary_supplementary"]["source_crs_wkt"])
    to_metric = Transformer.from_crs(TARGET_CRS, source, always_xy=True)
    polygon_boundary_metric = shapely_transform(polygon.boundary, to_metric.transform, interleaved=False)
    line_metric = shapely_transform(line, to_metric.transform, interleaved=False)
    distance = polygon_boundary_metric.hausdorff_distance(line_metric)
    return {
        "status": "close" if distance <= 5 else "needs_review",
        "method": "Hausdorff distance after transforming the WGS84 polygon boundary to the supplementary line source CRS",
        "distance_m": round(distance, 3),
        "threshold_m": 5,
        "note": "A close outline does not establish which boundary is authoritative.",
    }


def build_crosswalk(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return crosswalk_points(features)


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def report_markdown(manifest: dict[str, Any], crosswalk: list[dict[str, Any]]) -> str:
    rows = [
        "# GIS import audit",
        "",
        f"Status: **{manifest['status']}**",
        "",
        "Source shapefiles are read-only. The 35 QTG_Diem points are exported to an audit-only layer and are not loaded as public map markers. Canonical site and route JSON files are not modified.",
        "",
        "## Layers",
        "",
        "| Layer | Shape type | Features | CRS from PRJ | Invalid | Duplicates |",
        "|---|---|---:|---|---:|---:|",
    ]
    for key, audit in manifest["layers"].items():
        rows.append(
            f"| {key} | {audit['geometry_expected']} | {audit['feature_count_read']} | "
            f"{audit['source_crs_authority'] or audit['source_crs_name']} → EPSG:4326 | "
            f"{audit['feature_count_error']} | {audit['feature_count_duplicate_geometry']} |"
        )
    rows.extend([
        "",
        "## Spatial checks",
        "",
        f"- Supplementary boundary against QTG_RanhGioi: **{manifest['boundary_comparison']['status']}**, Hausdorff distance {manifest['boundary_comparison'].get('distance_m', 'n/a')} m.",
        f"- Road/water/rail/boundary GeoJSON layers: {sum(1 for v in manifest['layers'].values() if v['render_on_map'])} active overlays.",
        f"- Candidate heritage points: {len(crosswalk)}; all require identity/source review before inclusion in the public list.",
        "- The OSM-derived layers include attribution in the map controls. The supplied shapefiles do not include a separate license statement; verify source terms before public redistribution.",
        "",
        "## Point crosswalk review",
        "",
        "| GIS name | Exact name/alias candidates | Possible name matches | Decision |",
        "|---|---|---|---|",
    ])
    for row in crosswalk:
        exact = ", ".join(row["exact_name_or_alias_site_ids"]) or "—"
        possible = ", ".join(f"{x['site_id']} ({x['name_similarity']:.3f})" for x in row["possible_name_matches"]) or "—"
        rows.append(f"| {row['gis_name']} | {exact} | {possible} | Human review required |")
    rows.extend(["", "## Warnings", ""])
    rows.extend(f"- {warning}" for warning in manifest["warnings"])
    rows.extend(["", "Generated by `scripts/gis/build_layers.py`.", ""])
    return "\n".join(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="Directory containing the seven source shapefile sets")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "gis", help="Generated GeoJSON directory")
    parser.add_argument("--report-dir", type=Path, default=ROOT / "artifacts" / "gis-audit", help="Audit report directory")
    parser.add_argument("--check-only", action="store_true", help="Validate and write reports without exporting GeoJSON")
    args = parser.parse_args()
    source_dir = args.source.resolve()
    output_dir = args.output.resolve()
    report_dir = args.report_dir.resolve()
    if not source_dir.is_dir():
        parser.error(f"GIS source folder does not exist: {source_dir}")

    audits: dict[str, Any] = {}
    feature_sets: dict[str, list[dict[str, Any]]] = {}
    errors = []
    for layer_id, spec in LAYERS.items():
        try:
            audits[layer_id], feature_sets[layer_id] = inspect_layer(layer_id, spec, source_dir)
        except Exception as error:
            errors.append(f"{layer_id} ({spec['file']}): {type(error).__name__}: {error}")

    point_crosswalk = build_crosswalk(feature_sets.get("heritage_points_review", [])) if "heritage_points_review" in feature_sets else []
    warnings = [
        "QTG_Diem is a review dataset. Its 35 positions have no independent source/provenance in the supplied sidecars; they are not public markers.",
        "The current canonical list remains 32 sites with 25 gazette centroids and 7 unlocated sites; no GIS point is used to fill a missing location.",
        "Road lines have class and one-way attributes but network topology, pedestrian access, motorbike restrictions, and route connectivity have not been validated.",
    ]
    for layer_id, audit in audits.items():
        if audit["feature_count_read"] != audit["feature_count_expected_from_input"]:
            warnings.append(f"{layer_id}: read {audit['feature_count_read']} records; expected input count {audit['feature_count_expected_from_input']}.")
        if audit["feature_count_duplicate_geometry"]:
            warnings.append(f"{layer_id}: exact duplicate geometry records require review.")
        if audit["feature_count_error"]:
            errors.append(f"{layer_id}: {audit['feature_count_error']} record(s) could not be safely exported.")
        integrity = audit["source_file_integrity"]
        if not all(integrity[key] for key in ["shp_declared_length_matches", "shx_declared_length_matches", "shx_offsets_match_shp"]):
            errors.append(f"{layer_id}: SHP/SHX index or declared file length mismatch.")
        if integrity["shp_record_count"] != audit["feature_count_read"] or integrity["dbf_record_count"] != audit["feature_count_read"]:
            errors.append(f"{layer_id}: SHP geometry, SHX index and DBF row counts disagree.")
        unexpected = [geom for geom in audit["target_geometry_types"] if geom not in GEOMETRY_FAMILIES[audit["geometry_expected"]]]
        if unexpected:
            errors.append(f"{layer_id}: unexpected geometry types: {', '.join(unexpected)}.")
        if audit["source_format_warnings"]:
            warnings.append(f"{layer_id}: source geometry encoding warning(s): {'; '.join(audit['source_format_warnings'])}")
        if audit["source_crs_authority"] is None:
            warnings.append(f"{layer_id}: CRS parsed from WKT but pyproj did not resolve an EPSG authority code.")

    boundary_comparison = verify_boundary_pair(audits, feature_sets) if not errors else {"status": "not_run", "reason": "source geometry errors"}
    if boundary_comparison.get("status") == "needs_review":
        warnings.append(f"The two boundary layers differ by {boundary_comparison['distance_m']} m (Hausdorff distance); review before deciding which to use.")
    elif boundary_comparison.get("status") == "not_comparable":
        warnings.append(boundary_comparison["reason"])

    manifest = {
        "title": "Dấu chân Di sản — GIS conversion audit",
        "generated_utc": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source_directory_name": source_dir.name,
        "target_crs": "EPSG:4326",
        "geojson_coordinate_order": "longitude, latitude",
        "status": "FAIL" if errors else "PASS_WITH_WARNINGS" if warnings or boundary_comparison.get("status") != "close" else "PASS",
        "errors": errors,
        "warnings": warnings,
        "boundary_comparison": boundary_comparison,
        "layers": audits,
        "map_layer_ids": [key for key, spec in LAYERS.items() if spec.get("map", spec["show"])],
        "audit_only_layer_ids": [key for key, spec in LAYERS.items() if not spec.get("map", spec["show"])],
        "canonical_data_unchanged_by_pipeline": True,
        "route_geometry_created": False,
        "source_attribution": "OpenStreetMap-derived layers carry © OpenStreetMap contributors attribution. Source bundle has no separate license file; verify terms before redistribution.",
    }

    report_dir.mkdir(parents=True, exist_ok=True)
    write_json(report_dir / "manifest.json", manifest)
    write_json(report_dir / "site-crosswalk.json", point_crosswalk)
    with (report_dir / "site-crosswalk.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=["gis_record", "gis_name", "exact_name_or_alias_site_ids", "possible_name_matches", "identity_status", "public_map_status", "notes"])
        writer.writeheader()
        for row in point_crosswalk:
            writer.writerow({**row,
                "exact_name_or_alias_site_ids": ";".join(row["exact_name_or_alias_site_ids"]),
                "possible_name_matches": ";".join(f"{x['site_id']}:{x['name_similarity']:.3f}" for x in row["possible_name_matches"]),
            })
    (report_dir / "REPORT.md").write_text(report_markdown(manifest, point_crosswalk), encoding="utf-8")

    if not args.check_only and not errors:
        output_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="gis-export-", dir=output_dir) as temp_name:
            temp_dir = Path(temp_name)
            staged = []
            for layer_id, spec in LAYERS.items():
                collection = {
                    "type": "FeatureCollection",
                    "name": layer_id,
                    "metadata": {
                        "source_layer": spec["file"],
                        "source_crs": audits[layer_id]["source_crs_authority"] or audits[layer_id]["source_crs_name"],
                        "target_crs": "EPSG:4326",
                        "render_on_map": spec["show"],
                        "attribution": manifest["source_attribution"],
                    },
                    "features": feature_sets[layer_id],
                }
                staged_file = temp_dir / spec["output"]
                write_json(staged_file, collection)
                staged.append((staged_file, output_dir / spec["output"]))
            for staged_file, final_file in staged:
                shutil.move(str(staged_file), str(final_file))
        write_json(output_dir / "manifest.json", manifest)

    print(json.dumps({
        "status": manifest["status"],
        "source": str(source_dir),
        "target_crs": "EPSG:4326",
        "layers": {name: {"read": a["feature_count_read"], "valid": a["feature_count_exportable"], "duplicates": a["feature_count_duplicate_geometry"], "crs": a["source_crs_authority"]} for name, a in audits.items()},
        "boundary_comparison": boundary_comparison,
        "errors": errors,
        "warnings": warnings,
        "reports": str(report_dir),
        "geojson": None if args.check_only or errors else str(output_dir),
    }, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
