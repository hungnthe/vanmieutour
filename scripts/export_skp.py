"""Bake visible SKP geometry to GLB in metres (X east, Y up, Z south).

Uses an installed SketchUp C API, not an online converter. SKP remains read-only.
Solid material colours are preserved; texture bitmaps are not exported.
"""
import ctypes as C
import hashlib
import json
import struct
from collections import defaultdict
from pathlib import Path
import numpy as np
from inspect_skp import api, call, ref, refs, number, string, Ref, Size, SDK

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parents[1] / 'model_2.skp'
OUTPUT = ROOT / 'data' / 'model'

class Transform(C.Structure):
    _fields_ = [('values', C.c_double * 16)]

class Color(C.Structure):
    _fields_ = [('r', C.c_ubyte), ('g', C.c_ubyte), ('b', C.c_ubyte), ('a', C.c_ubyte)]

for name in ['SUFaceToDrawingElement', 'SUGroupToDrawingElement', 'SUComponentInstanceToDrawingElement']:
    getattr(api, name).restype = Ref

def drawing(kind, obj):
    return Ref(getattr(api, f'SU{kind}ToDrawingElement')(obj))

def visible(elem):
    if number('SUDrawingElementGetHidden', elem, C.c_bool): return False
    layer = ref('SUDrawingElementGetLayer', elem)
    return number('SULayerGetVisibility', layer, C.c_bool)

material_cache = {}
def material(elem, inherited):
    mat = Ref()
    if api.SUDrawingElementGetMaterial(elem, C.byref(mat)) != 0 or not mat.value: return inherited
    if mat.value not in material_cache:
        color = Color(218, 216, 207, 255)
        api.SUMaterialGetColor(mat, C.byref(color))
        material_cache[mat.value] = (string('SUMaterialGetName', mat), (color.r/255, color.g/255, color.b/255, 1))
    return material_cache[mat.value]

def transformation(name, obj):
    value = Transform()
    call(name, obj, C.byref(value))
    return np.array(value.values).reshape(4,4,order='F')

chunks = defaultdict(list)
stats = {'faces': 0, 'triangles': 0, 'groups': 0, 'instances': 0, 'hidden_objects': 0,'layers':{}}
mesh_cache = {}

def face_mesh(face):
    if face.value in mesh_cache: return mesh_cache[face.value]
    helper = Ref()
    call('SUMeshHelperCreate', C.byref(helper), face)
    try:
        nv = number('SUMeshHelperGetNumVertices', helper)
        nt = number('SUMeshHelperGetNumTriangles', helper)
        vertices = (C.c_double * (nv*3))()
        indices = (Size * (nt*3))()
        call('SUMeshHelperGetVertices', helper, Size(nv), vertices, C.byref(Size()))
        call('SUMeshHelperGetVertexIndices', helper, Size(nt*3), indices, C.byref(Size()))
        v = np.ctypeslib.as_array(vertices).reshape(-1,3).copy()
        idx = np.ctypeslib.as_array(indices).copy()
        mesh_cache[face.value] = v[idx].reshape(-1,3)
        return mesh_cache[face.value]
    finally: call('SUMeshHelperRelease', C.byref(helper))

def source_layer(elem, inherited):
    layer=ref('SUDrawingElementGetLayer',elem)
    name=string('SULayerGetName',layer)
    return inherited if name.lower() in {'','layer0','layer00','default'} else name

def walk(entities, matrix, inherited=('Default', (0.79,0.78,0.74,1)), parent_layer='Default', depth=0):
    if depth > 64: raise ValueError('Unexpected component nesting')
    for face in refs('SUEntitiesGetFaces', entities):
        elem = drawing('Face', face)
        if not visible(elem): continue
        name=source_layer(elem,parent_layer)
        points = face_mesh(face)
        world = points @ matrix[:3,:3].T + matrix[:3,3]
        if np.linalg.det(matrix[:3,:3]) < 0: world = world.reshape(-1,3,3)[:,[0,2,1],:].reshape(-1,3)
        mat=material(elem,inherited)
        chunks[(name,mat)].append(world * 0.0254)
        stats['faces'] += 1
        stats['triangles'] += len(world)//3
        layer_stats=stats['layers'].setdefault(name,{'faces':0,'triangles':0,'materials':set(),'bounds_m':None})
        layer_stats['faces']+=1;layer_stats['triangles']+=len(world)//3;layer_stats['materials'].add(mat[0])
        b=np.stack([world.min(axis=0),world.max(axis=0)])*.0254
        if layer_stats['bounds_m'] is None: layer_stats['bounds_m']=b
        else: layer_stats['bounds_m']=np.stack([np.minimum(layer_stats['bounds_m'][0],b[0]),np.maximum(layer_stats['bounds_m'][1],b[1])])
    for kind, plural in [('Group','Groups'), ('ComponentInstance','Instances')]:
        for obj in refs('SUEntitiesGet'+plural, entities):
            elem = drawing(kind, obj)
            if not visible(elem):
                stats['hidden_objects'] += 1
                continue
            stats['groups' if kind == 'Group' else 'instances'] += 1
            mat = matrix @ transformation(f'SU{kind}GetTransform', obj)
            if kind == 'Group': child = ref('SUGroupGetEntities', obj)
            else: child = ref('SUComponentDefinitionGetEntities', ref('SUComponentInstanceGetDefinition', obj))
            walk(child, mat, material(elem, inherited), source_layer(elem,parent_layer), depth+1)
    if depth == 0: print('Geometry', stats, flush=True)

def write_glb():
    doc = {'asset': {'version':'2.0','generator':'SketchUp C API export_skp.py'}, 'scene':0,
           'scenes':[{'nodes':[0]}], 'nodes':[{'name':'model_2.skp','children':[]}],
           'meshes':[], 'materials':[], 'accessors':[], 'bufferViews':[], 'buffers':[]}
    binary = bytearray()
    bounds = [np.full(3,np.inf),np.full(3,-np.inf)]
    def accessor(data, typ, extrema=False, indices=False):
        raw = np.asarray(data,dtype='<u4' if indices else '<f4')
        view = len(doc['bufferViews'])
        doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':raw.nbytes,'target':34963 if indices else 34962})
        binary.extend(raw.tobytes())
        ac = {'bufferView':view,'componentType':5125 if indices else 5126,'count':len(raw),'type':typ}
        if extrema: ac.update(min=raw.min(axis=0).tolist(),max=raw.max(axis=0).tolist())
        doc['accessors'].append(ac)
        return len(doc['accessors'])-1
    layer_node_indices={}
    for (layer_name,(name,color)),parts in chunks.items():
        points = np.concatenate(parts)
        bounds[0] = np.minimum(bounds[0], points.min(axis=0))
        bounds[1] = np.maximum(bounds[1], points.max(axis=0))
        # SKP Z-up -> glTF Y-up; normals computed after transformation.
        points = points[:,[0,2,1]] * [1,1,-1]
        triangles = points.reshape(-1,3,3)
        normals = np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0])
        lengths = np.linalg.norm(normals,axis=1)
        normals /= np.maximum(lengths[:,None],1e-12)
        combined=np.column_stack([points,np.round(np.repeat(normals,3,axis=0),6)]).astype('<f4')
        unique,indices=np.unique(combined,axis=0,return_inverse=True)
        normal = accessor(unique[:,3:],'VEC3')
        position = accessor(unique[:,:3],'VEC3',True)
        index_accessor = accessor(indices,'SCALAR',indices=True)
        mi = len(doc['materials'])
        doc['materials'].append({'name':name,'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':list(color),'metallicFactor':0,'roughnessFactor':0.9}})
        node_index=layer_node_indices.get(layer_name)
        if node_index is None:
            node_index=len(doc['nodes']);layer_node_indices[layer_name]=node_index
            doc['nodes'].append({'name':layer_name,'children':[]})
            doc['nodes'][0]['children'].append(node_index)
        mesh_index=len(doc['meshes'])
        doc['meshes'].append({'name':f'{layer_name} · {name}','primitives':[{'attributes':{'POSITION':position,'NORMAL':normal},'indices':index_accessor,'material':mi,'mode':4}]})
        child_index=len(doc['nodes']);doc['nodes'].append({'name':name,'mesh':mesh_index})
        doc['nodes'][node_index]['children'].append(child_index)
    doc['buffers'] = [{'byteLength':len(binary)}]
    encoded = json.dumps(doc,separators=(',',':')).encode()
    encoded += b' ' * (-len(encoded)%4)
    binary.extend(b'\0' * (-len(binary)%4))
    data = struct.pack('<III',0x46546C67,2,12+8+len(encoded)+8+len(binary)) + struct.pack('<II',len(encoded),0x4E4F534A)+encoded+struct.pack('<II',len(binary),0x004E4942)+binary
    (OUTPUT/'model_2.glb').write_bytes(data)
    return [v.tolist() for v in bounds], len(data)

def line_groups(entities):
    lines = {}
    for group in refs('SUEntitiesGetGroups', entities):
        name = string('SUGroupGetName', group)
        if not name.endswith('_lines'): continue
        transform = transformation('SUGroupGetTransform', group)
        child = ref('SUGroupGetEntities', group)
        n=Size(); call('SUEntitiesGetNumEdges',child,C.c_bool(False),C.byref(n))
        edges=(Ref*n.value)(); call('SUEntitiesGetEdges',child,C.c_bool(False),n,edges,C.byref(Size()))
        result=[]
        for edge in edges:
            pair=[]
            for end in ['Start','End']:
                v=ref('SUEdgeGet'+end+'Vertex',Ref(edge))
                p=(C.c_double*3)();call('SUVertexGetPosition',v,C.byref(p))
                pair.append(((transform[:3,:3]@np.array(p)+transform[:3,3])*.0254).tolist())
            result.append(pair)
        lines[name]=result
    return lines

if __name__ == '__main__':
    OUTPUT.mkdir(exist_ok=True,parents=True)
    api.SUInitialize()
    model=Ref()
    call('SUModelCreateFromFile',C.byref(model),str(SOURCE).encode())
    try:
        entities=ref('SUModelGetEntities',model)
        lines=line_groups(entities)
        (OUTPUT/'source-lines.json').write_text(json.dumps(lines),encoding='utf-8')
        print('Line groups', {k:len(v) for k,v in lines.items()},flush=True)
        walk(entities,np.eye(4))
        bounds, length=write_glb()
        for data in stats['layers'].values():
            data['materials']=sorted(data['materials']);data['bounds_m']=data['bounds_m'].tolist()
        audit={'source':'model_2.skp','source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
               'georeferenced':number('SUModelIsGeoReferenced',model,C.c_bool),'sdk':str(SDK),
               'bounds_skp_m':bounds,'glb_bytes':length,'stats':stats,'materials':len(chunks),
               'notes':['Visible faces and nested instance transforms baked in metres.','Original solid colours; texture bitmaps and standalone edges omitted.','No change to source SKP or canonical heritage coordinates.']}
        (OUTPUT/'conversion.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
        print(json.dumps(audit,indent=2))
    finally:
        call('SUModelRelease',C.byref(model)); api.SUTerminate()
