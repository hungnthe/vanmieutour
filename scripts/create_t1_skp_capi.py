"""Build a grouped, locally centered SketchUp model from the original t1 GIS shapefiles."""
from __future__ import annotations
import ctypes as C
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'artifacts' / 't1_skp_data.json'
OUTPUT = Path(r'D:\TourVanMieu\VanMieu_T1_GIS.skp')
SDK = Path(r'C:\Program Files\Unity 2022.3.52f1\Editor\SketchUpAPI.dll')
os.add_dll_directory(str(SDK.parent))
api = C.CDLL(str(SDK))
Ref, Size = C.c_void_p, C.c_size_t

class Point3D(C.Structure):
    _fields_ = [('x', C.c_double), ('y', C.c_double), ('z', C.c_double)]
class Vector3D(C.Structure):
    _fields_ = [('x', C.c_double), ('y', C.c_double), ('z', C.c_double)]
class Color(C.Structure):
    _fields_ = [('r', C.c_ubyte), ('g', C.c_ubyte), ('b', C.c_ubyte), ('a', C.c_ubyte)]

for n in ['SUGeometryInputAddFace','SUGeometryInputAddEdge','SUGeometryInputAddVertex','SUEntitiesFill','SUModelCreate','SUModelSaveToFile']:
    getattr(api, n).restype = C.c_int

def call(name, *args):
    result = getattr(api, name)(*args)
    if result != 0:
        raise RuntimeError(f'{name}: SUResult {result}')
    return result

def point(x, y, z):
    # C API stores model lengths in inches; source GIS coordinates are metres.
    k = 39.37007874015748
    return Point3D(float(x)*k, float(y)*k, float(z)*k)

def material_create(model, name, rgb):
    material = Ref()
    call('SUMaterialCreate', C.byref(material))
    call('SUMaterialSetName', material, name.encode('utf-8'))
    color = Color(*rgb, 255)
    call('SUMaterialSetColor', material, C.byref(color))
    items = (Ref * 1)(material)
    call('SUModelAddMaterials', model, Size(1), items)
    return material

LAYERS = {}

def layer_create(model, name):
    if name in LAYERS:
        return LAYERS[name]
    layer = Ref()
    call('SULayerCreate', C.byref(layer))
    call('SULayerSetName', layer, name.encode('utf-8'))
    items = (Ref * 1)(layer)
    call('SUModelAddLayers', model, Size(1), items)
    LAYERS[name] = layer
    return layer

def group_create(root, name, layer):
    group = Ref()
    call('SUGroupCreate', C.byref(group))
    call('SUEntitiesAddGroup', root, group)
    call('SUGroupSetName', group, name.encode('utf-8'))
    # Function returns an SUDrawingElementRef by value.
    to_drawing = api.SUGroupToDrawingElement
    to_drawing.restype = Ref
    api.SUDrawingElementSetLayer.argtypes = [Ref, Ref]
    api.SUDrawingElementSetLayer.restype = C.c_int
    element = to_drawing(group)
    result = api.SUDrawingElementSetLayer(element, layer)
    if result != 0: raise RuntimeError(f'SUDrawingElementSetLayer: SUResult {result}')
    entities = Ref()
    call('SUGroupGetEntities', group, C.byref(entities))
    return group, entities

def build_group(model, root, name, tag_name, paths=None, faces=None, z=0.0,
                edge_material=None, face_material=None, hidden=False):
    paths = paths or []
    faces = faces or []
    layer = layer_create(model, tag_name)
    group, entities = group_create(root, name, layer)
    geometry = Ref()
    call('SUGeometryInputCreate', C.byref(geometry))
    vertex_lookup = {}
    def vertex_id(xy, elevation):
        coords = (round(float(xy[0]), 3), round(float(xy[1]), 3), round(float(elevation), 3))
        if coords not in vertex_lookup:
            idx = len(vertex_lookup)
            vertex_lookup[coords] = idx
            p = point(*coords)
            call('SUGeometryInputAddVertex', geometry, C.byref(p))
        return vertex_lookup[coords]
    edge_lookup = set()
    edge_count = 0
    for path in paths:
        if len(path) < 2:
            continue
        ids = [vertex_id(xy, z) for xy in path]
        for a, b in zip(ids, ids[1:]):
            if a == b:
                continue
            key = (min(a, b), max(a, b))
            if key in edge_lookup:
                continue
            edge_lookup.add(key)
            edge_index = Size()
            call('SUGeometryInputAddEdge', geometry, Size(a), Size(b), C.byref(edge_index))
            edge_count += 1
    face_count = 0
    for face_vertices in faces:
        if len(face_vertices) < 3:
            continue
        pts = list(face_vertices)
        area = sum(pts[i][0]*pts[(i+1)%len(pts)][1] - pts[(i+1)%len(pts)][0]*pts[i][1] for i in range(len(pts)))
        if area < 0:
            pts.reverse()
        loop = Ref()
        call('SULoopInputCreate', C.byref(loop))
        loop_ids = [vertex_id(xy, z) for xy in pts]
        for idx in loop_ids:
            call('SULoopInputAddVertexIndex', loop, Size(idx))
        # Suppress the triangulation seams; clean outlines are added as normal edges.
        for i in range(len(loop_ids)):
            try:
                call('SULoopInputEdgeSetHidden', loop, Size(i), C.c_bool(True))
            except RuntimeError:
                pass
        face_index = Size()
        call('SUGeometryInputAddFace', geometry, C.byref(loop), C.byref(face_index))
        face_count += 1
    if edge_count or face_count:
        call('SUEntitiesFill', entities, geometry, C.c_bool(True))
    call('SUGeometryInputRelease', C.byref(geometry))
    def apply_materials(kind, mat, to_drawing_name):
        if not mat: return
        count = Size()
        if kind == 'Edges':
            call('SUEntitiesGetNumEdges', entities, C.c_bool(False), C.byref(count))
            refs = (Ref * count.value)()
            actual = Size()
            call('SUEntitiesGetEdges', entities, C.c_bool(False), Size(count.value), refs, C.byref(actual))
        else:
            call('SUEntitiesGetNumFaces', entities, C.byref(count))
            refs = (Ref * count.value)()
            actual = Size()
            call('SUEntitiesGetFaces', entities, Size(count.value), refs, C.byref(actual))
        to_drawing = getattr(api, to_drawing_name); to_drawing.restype = Ref
        api.SUDrawingElementSetMaterial.argtypes = [Ref, Ref]; api.SUDrawingElementSetMaterial.restype = C.c_int
        for entity in refs[:actual.value]:
            result = api.SUDrawingElementSetMaterial(to_drawing(Ref(entity)), mat)
            if result != 0: raise RuntimeError(f'SUDrawingElementSetMaterial: SUResult {result}')
    apply_materials('Edges', edge_material, 'SUEdgeToDrawingElement')
    apply_materials('Faces', face_material, 'SUFaceToDrawingElement')
    if hidden:
        element = api.SUGroupToDrawingElement(group)
        api.SUDrawingElementSetHidden.argtypes = [Ref, C.c_bool]
        api.SUDrawingElementSetHidden.restype = C.c_int
        result = api.SUDrawingElementSetHidden(element, C.c_bool(True))
        if result != 0: raise RuntimeError(f'SUDrawingElementSetHidden: SUResult {result}')
    return {'group': name, 'tag': tag_name, 'edges': edge_count, 'faces': face_count}

def main():
    data = json.loads(DATA.read_text(encoding='utf-8'))
    print('SUInitialize result', api.SUInitialize())
    model = Ref()
    try:
        call('SUModelCreate', C.byref(model))
        call('SUModelSetName', model, 'Văn Miếu · mô hình GIS từ t1'.encode('utf-8'))
        call('SUModelSetDescription', model, (
            'Mô hình lớp GIS từ các tệp trong t1. Tọa độ WGS84 được chuyển sang UTM 48N rồi đặt quanh gốc cục bộ. '
            'QTG_Diem là lớp điểm tham chiếu cần đối soát, không xác nhận danh tính/vị trí chính thức.'
        ).encode('utf-8'))
        root = Ref()
        call('SUModelGetEntities', model, C.byref(root))
        results = []
        colors = {
            'primary': [167,91,65], 'primary_link': [184,117,77],
            'secondary': [180,128,82], 'secondary_link': [196,151,103],
            'tertiary': [191,155,116], 'residential': [88,109,113],
            'service': [117,135,134], 'footway': [142,154,146],
            'pedestrian': [171,160,132], 'path': [153,163,139],
            'steps': [177,147,119], 'cycleway': [114,153,150],
            'other': [110,125,128]
        }
        for road_class, paths in data['roads'].items():
            mat = material_create(model, 'Đường · ' + road_class, colors.get(road_class, colors['other']))
            results.append(build_group(model, root, f'Đường · {road_class} ({len(paths)} đoạn)',
                'T1 · Mạng đường', paths=paths, z=0.8, edge_material=mat))
        water = material_create(model, 'Mặt nước · xanh lam', [91,174,184])
        water_edges = material_create(model, 'Viền mặt nước · xanh đậm', [71,144,157])
        results.append(build_group(model, root, 'Mặt nước · 13 đối tượng nguồn', 'T1 · Mặt nước',
            faces=data['water_faces'], z=0.35, face_material=water))
        results.append(build_group(model, root, 'Viền mặt nước', 'T1 · Mặt nước',
            paths=data['water_outlines'], z=0.4, edge_material=water_edges))
        rail = material_create(model, 'Đường sắt · than xanh', [61,74,86])
        results.append(build_group(model, root, f'Đường sắt · {len(data["railways_area"])} đoạn',
            'T1 · Đường sắt', paths=data['railways_area'], z=1.5, edge_material=rail))
        boundary = material_create(model, 'Ranh giới nguồn · vàng', [211,161,72])
        results.append(build_group(model, root, 'Ranh giới · QTG_RanhGioi (viền nguồn)',
            'T1 · Ranh giới', paths=data['boundary'], z=2.3, edge_material=boundary))
        supp = material_create(model, 'Ranh giới bổ sung · xanh ngọc', [64,169,151])
        results.append(build_group(model, root, 'Ranh giới bổ sung · ranhgioi (UTM)',
            'T1 · Ranh giới bổ sung', paths=data['boundary_supplementary'], z=2.6,
            edge_material=supp, hidden=True))
        point_mat = material_create(model, 'Điểm tham chiếu · đất nung', [181,91,67])
        for i, feature in enumerate(data['points'], 1):
            x, y = feature['xy']
            # Low 12-sided pyramidal markers, one independently selectable group per point.
            import math
            n, radius, base_z, tip_z = 12, 3.8, 3.3, 10.3
            ring = [[x+radius*math.cos(2*math.pi*j/n), y+radius*math.sin(2*math.pi*j/n)] for j in range(n)]
            triangles = []
            for j in range(n):
                triangles.append([ring[j], ring[(j+1)%n], [x,y]])
            # A low, filled disk emphasizes each source point while keeping its index and name in the Outliner.
            point_tag = layer_create(model, 'T1 · Điểm tham chiếu (cần đối soát)') if i == 1 else point_layer
            if i == 1: point_layer = point_tag
            group, entities = group_create(root, f'{i:02d} · {feature["name"] or "Điểm QTG_Diem"}', point_layer)
            geo = Ref(); call('SUGeometryInputCreate', C.byref(geo))
            cache = {}
            def add_v(xy,z):
                k=(round(xy[0],3),round(xy[1],3),round(z,3))
                if k not in cache:
                    cache[k]=len(cache); p=point(*k); call('SUGeometryInputAddVertex',geo,C.byref(p))
                return cache[k]
            for tri in triangles:
                ids=[add_v(tri[0],tip_z),add_v(tri[1],tip_z),add_v(tri[2],base_z)]
                loop=Ref(); call('SULoopInputCreate',C.byref(loop))
                for idx in ids: call('SULoopInputAddVertexIndex',loop,Size(idx))
                fi=Size(); call('SUGeometryInputAddFace',geo,C.byref(loop),C.byref(fi))
                call('SUGeometryInputFaceSetFrontMaterial',geo,fi,point_mat)
                call('SUGeometryInputFaceSetBackMaterial',geo,fi,point_mat)
            call('SUEntitiesFill',entities,geo,C.c_bool(True)); call('SUGeometryInputRelease',C.byref(geo))
            results.append({'group':f'{i:02d} · {feature["name"]}', 'tag':'T1 · Điểm tham chiếu', 'faces':n})
        # A high, centered oblique view gives the 1 km × 2.5 km map room in the web viewer.
        camera = Ref(); call('SUCameraCreate',C.byref(camera))
        pos, target, up = point(250,-3400,4300), point(0,0,0), Vector3D(0,0,1)
        call('SUCameraSetOrientation',camera,C.byref(pos),C.byref(target),C.byref(up))
        call('SUCameraSetPerspectiveFrustumFOV',camera,C.c_double(38.0))
        call('SUModelSetCamera',model,C.byref(camera))
        OUTPUT.parent.mkdir(parents=True,exist_ok=True)
        call('SUModelSaveToFile',model,str(OUTPUT).encode('utf-8'))
        audit={'output':str(OUTPUT),'groups':len(results),'road_classes':len(data['roads']),
               'road_paths':sum(len(v) for v in data['roads'].values()),
               'water_triangles':len(data['water_faces']),'rail_lines':len(data['railways_area']),
               'points_review_only':len(data['points']),'records':results}
        print(json.dumps(audit,ensure_ascii=True))
    finally:
        if model.value: call('SUModelRelease',C.byref(model))
        api.SUTerminate()

if __name__ == '__main__':
    main()
