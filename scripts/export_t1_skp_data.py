from __future__ import annotations
import json
from pathlib import Path
import shapefile
from pyproj import Transformer
from shapely.geometry import shape as make_shape, LineString, MultiLineString, Polygon, MultiPolygon, GeometryCollection
from shapely.ops import transform as geom_transform, triangulate
from shapely.affinity import translate

SRC = Path(r'D:\TourVanMieu\t1\t1')
OUT = Path(r'D:\TourVanMieu\dau-chan-di-san-codex-handoff\heritage-map\artifacts\t1_skp_data.json')
TO_UTM = Transformer.from_crs('EPSG:4326', 'EPSG:32648', always_xy=True)

def read_layer(name, utm=False):
    r = shapefile.Reader(str(SRC / name), encoding='utf-8')
    fields = [f[0] for f in r.fields[1:]]
    features = []
    for sh, rec in zip(r.shapes(), r.records()):
        g = make_shape(sh.__geo_interface__)
        if not utm:
            g = geom_transform(lambda x, y, z=None: TO_UTM.transform(x, y), g)
        features.append((g, dict(zip(fields, list(rec)))))
    return features

def lines_of(g):
    if g is None or g.is_empty:
        return
    if isinstance(g, LineString):
        yield g
    elif isinstance(g, (MultiLineString, GeometryCollection)):
        for sub in g.geoms:
            yield from lines_of(sub)

def polygons_of(g):
    if g is None or g.is_empty:
        return
    if isinstance(g, Polygon):
        yield g
    elif isinstance(g, (MultiPolygon, GeometryCollection)):
        for sub in g.geoms:
            yield from polygons_of(sub)

def line_coords(line):
    return [[round(float(x), 3), round(float(y), 3)] for x, y, *_ in line.coords]

# Project all sources to UTM 48N. Center the local model around the source boundary.
boundary_src = read_layer('QTG_RanhGioi')[0][0]
if not boundary_src.is_valid:
    boundary_src = boundary_src.buffer(0)
minx, miny, maxx, maxy = boundary_src.bounds
origin = ((minx + maxx) / 2, (miny + maxy) / 2)
def local(g):
    return translate(g, xoff=-origin[0], yoff=-origin[1])

boundary_local = local(boundary_src)
boundary_paths = []
for poly in polygons_of(boundary_local):
    boundary_paths.append(line_coords(poly.exterior))
    boundary_paths.extend(line_coords(ring) for ring in poly.interiors)

roads_by_class = {}
road_features = read_layer('road_Clip1')
for g, attrs in road_features:
    for ln in lines_of(local(g)):
        roads_by_class.setdefault(str(attrs.get('fclass') or 'other'), []).append(line_coords(ln))

water_faces, water_outlines = [], []
for g, attrs in read_layer('nuoc'):
    for poly in polygons_of(local(g)):
        if not poly.is_valid:
            poly = poly.buffer(0)
        water_outlines.append(line_coords(LineString(poly.exterior.coords)))
        water_outlines.extend(line_coords(LineString(r.coords)) for r in poly.interiors)
        for tri in triangulate(poly):
            if poly.covers(tri):
                water_faces.append([[round(float(x), 3), round(float(y), 3)] for x, y in list(tri.exterior.coords)[:3]])

rail_paths = []
for g, attrs in read_layer('duongtau'):
    for ln in lines_of(local(g)):
        rail_paths.append(line_coords(ln))

# Retain the broader railway source in a separate, initially hidden, clipped context layer.
context_paths = []
for g, attrs in read_layer('railways'):
    try:
        cut = g.intersection(boundary_src)
    except Exception:
        continue
    for ln in lines_of(local(cut)):
        if len(ln.coords) > 1:
            context_paths.append(line_coords(ln))

supp_paths = []
for g, attrs in read_layer('ranhgioi', utm=True):
    for ln in lines_of(local(g)):
        supp_paths.append(line_coords(ln))

points = []
for g, attrs in read_layer('QTG_Diem'):
    if g.geom_type == 'Point':
        p = local(g)
        points.append({'name': str(attrs.get('Name') or ''), 'xy': [round(float(p.x), 3), round(float(p.y), 3)]})

payload = {
    'metadata': {
        'title': 'Văn Miếu · lớp dữ liệu GIS từ thư mục t1',
        'source': str(SRC),
        'projection': 'WGS 84 / UTM zone 48N (EPSG:32648); mô hình được đặt quanh gốc cục bộ.',
        'warning': 'QTG_Diem là lớp điểm tham chiếu cần đối soát, không xác nhận danh tính hay vị trí di tích.',
        'center_utm_m': [round(origin[0], 3), round(origin[1], 3)],
    },
    'boundary': boundary_paths,
    'boundary_supplementary': supp_paths,
    'roads': roads_by_class,
    'water_faces': water_faces,
    'water_outlines': water_outlines,
    'railways_area': rail_paths,
    'railways_context': context_paths,
    'points': points,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(json.dumps({'output': str(OUT), 'boundary_valid': boundary_src.is_valid, 'boundary_area_m2': round(boundary_src.area, 2), 'road_classes': {k: len(v) for k,v in roads_by_class.items()}, 'roads_paths': sum(map(len, roads_by_class.values())), 'water_triangles': len(water_faces), 'rail_area_paths': len(rail_paths), 'rail_context_paths': len(context_paths), 'supplementary_boundary_paths': len(supp_paths), 'points': len(points), 'point_names_sample': [p['name'] for p in points[:3]]}, ensure_ascii=True))
