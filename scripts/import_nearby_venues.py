"""Build the 3D tour venue catalogue from the user-supplied Excel and KML.

Run with a Python environment containing openpyxl:
  python scripts/import_nearby_venues.py <workbook.xlsx> <venues.kml>

The source POI names are mapped to the project's 32 canonical site IDs. Coordinates
are copied from the supplied files; this script does not geocode or move them.
"""

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "nearby-venues.json"
NON_VENUE_CATEGORIES = {
    "Bảo tàng mỹ thuật (triển lãm tạm thời)",
    "Chợ",
    "Di tích / triển lãm",
    "Phòng tranh (sơn mài, miễn phí)",
    "Phòng tranh (thông tin ít)",
}
SOURCE_POI_TO_SITE = {
    "Chùa Bà Nành": "ba_nanh",
    "Chùa Bụt Mọc": "but_moc",
    "Chùa Huy Văn": "huy_van",
    "Chùa Linh Quang": "linh_quang",
    "Chùa Linh Ứng": "linh_ung",
    "Chùa Liên Hoa": "lien_hoa",
    "Chùa Mỹ Quang": "my_quang",
    "Chùa Ngọc Hồ (Bà Ngô)": "ngoc_ho",
    "Chùa Phổ Giác": "pho_giac",
    "Chùa Phụng Thánh": "phung_thanh",
    "Chùa Quang Minh": "quang_minh",
    "Chùa Tiên Phúc Tự": "ba_nanh",
    "Chùa Tiên Tích": "tien_tich",
    "Chùa Trung Tự": "trung_tu_chua",
    "Giếng Ngọc Đình Trung Tự": "trung_tu_dinh",
    "Gò Kim Châu": "ho_van",
    "Hồ Giám": "ho_van",
    "Văn Miếu - Quốc Tử Giám": "van_mieu",
    "Y Miếu": "y_mieu",
    "Đài tưởng niệm Khâm Thiên": "kham_thien",
    "Đình - Đền Lương Sử": "luong_su",
    "Đình Khâm Đức": "kham_duc_dinh",
    "Đình Làng Thổ Quan": "tho_quan",
    "Đình Thanh Miến": "thanh_mien",
    "Đình Thái Kiều": "thai_kieu",
    "Đình Trung Kính": "trung_kinh",
    "Đình Văn Hương": "van_huong",
    "Đình làng Trung Tự": "trung_tu_dinh",
    "Đền - Đình Kim Liên": "kim_lien",
    "Đền Khâm Đức - thờ Châu Đệ Tứ": "kham_duc_den",
    "Đền Mẫu Sòng Sơn - Hà Nội": "song_son",
    "Đền Trung Phụng": "trung_phung",
    "Đền Trung Tả": "trung_ta",
    "Đền Văn Chỉ": "van_chi",
    "Đền Đức Thánh Trần": "duc_thanh_tran",
}


def venue_key(name, lat, lng):
    return name.strip().casefold(), round(float(lat), 7), round(float(lng), 7)


def load_kml_keys(path):
    ns = {"k": "http://www.opengis.net/kml/2.2"}
    root = ET.parse(path)
    folders = root.findall(".//k:Folder", ns)
    shops = next(folder for folder in folders if folder.findtext("k:name", namespaces=ns) == "Quán trong 300 m")
    keys = set()
    for placemark in shops.findall("k:Placemark", ns):
        name = placemark.findtext("k:name", namespaces=ns)
        coords = placemark.findtext("k:Point/k:coordinates", namespaces=ns)
        lng, lat = [float(value) for value in coords.split(",")[:2]]
        keys.add(venue_key(name, lat, lng))
    return keys


def main(workbook_path, kml_path):
    sites = {site["id"] for site in json.loads((ROOT / "data" / "sites.json").read_text(encoding="utf-8"))}
    assert set(SOURCE_POI_TO_SITE.values()) == sites, "POI mapping must cover all canonical sites"
    workbook = load_workbook(workbook_path, read_only=True, data_only=True)
    rows = workbook["Chi tiết"].values
    next(rows)  # header
    venues = {}
    for row in rows:
        poi, name, category, distance, lat, lng, _maps, source = row[:8]
        if not (poi and name and category and distance is not None and lat is not None and lng is not None):
            continue  # workbook footer and handwritten research notes
        if poi not in SOURCE_POI_TO_SITE:
            raise ValueError(f"Unmapped POI: {poi}")
        distance = int(round(float(distance)))
        lat, lng = float(lat), float(lng)
        if not (0 <= distance <= 300 and 20.8 < lat < 21.2 and 105.6 < lng < 106.0):
            raise ValueError(f"Invalid distance or coordinate: {name} / {poi}")
        key = venue_key(name, lat, lng)
        venue = venues.setdefault(key, {
            "name": name.strip(), "category": category.strip(), "lat": lat, "lng": lng,
            "source": source or "Không ghi nguồn", "near": {},
        })
        if venue["category"] != category.strip() or venue["source"] != (source or "Không ghi nguồn"):
            raise ValueError(f"Conflicting details for {name}")
        site_id = SOURCE_POI_TO_SITE[poi]
        current = venue["near"].get(site_id)
        if current is None or distance < current["distanceM"]:
            venue["near"][site_id] = {"siteId": site_id, "sourcePoi": poi, "distanceM": distance}

    kml_keys = load_kml_keys(kml_path)
    if set(venues) != kml_keys:
        raise ValueError(f"Excel/KML venue mismatch: {len(set(venues)-kml_keys)} Excel-only, {len(kml_keys-set(venues))} KML-only")

    output = []
    for key in sorted(venues):
        venue = venues[key]
        if venue["category"] in NON_VENUE_CATEGORIES:
            continue  # supplied places that are not eateries, cafes or other quán xá
        venue["id"] = f"venue-{len(output)+1:03d}"
        venue["near"] = sorted(venue["near"].values(), key=lambda link: (link["distanceM"], link["siteId"]))
        output.append(venue)
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    links = sum(len(venue["near"]) for venue in output)
    print(f"Verified {len(venues)} Excel/KML places; wrote {len(output)} venues, {links} canonical site links to {OUTPUT}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python scripts/import_nearby_venues.py <workbook.xlsx> <venues.kml>")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
