"""Inspect a local SKP using an installed SketchUp C API; never changes the SKP."""
import ctypes as C
import os
from pathlib import Path

SDK = Path(os.environ.get('SKETCHUP_API_DLL', r'C:\Program Files\Unity 2022.3.52f1\Editor\SketchUpAPI.dll'))
_directory = os.add_dll_directory(str(SDK.parent))
api = C.CDLL(str(SDK))
Ref = C.c_void_p
Size = C.c_size_t

def call(name, *args):
    result = getattr(api, name)(*args)
    if result != 0:
        raise RuntimeError(f'{name}: SUResult {result}')

def ref(name, *args):
    value = Ref()
    call(name, *args, C.byref(value))
    return value

def number(name, obj, kind=Size):
    value = kind()
    call(name, obj, C.byref(value))
    return value.value

def refs(stem, obj):
    n = number(stem.replace('Get', 'GetNum', 1), obj)
    values = (Ref * n)()
    count = Size()
    call(stem, obj, Size(n), values, C.byref(count))
    return [Ref(v) for v in values[:count.value]]

def string(name, obj, *args):
    s = ref('SUStringCreate')
    try:
        call(name, obj, *args, C.byref(s))
        size = number('SUStringGetUTF8Length', s)
        buf = C.create_string_buffer(size + 1)
        call('SUStringGetUTF8', s, Size(size + 1), buf, C.byref(Size()))
        return buf.value.decode('utf-8')
    finally:
        call('SUStringRelease', C.byref(s))

def inspect(model):
    print('georeferenced', number('SUModelIsGeoReferenced', model, C.c_bool), flush=True)
    location = ref('SUModelGetLocation', model)
    lat, lng = C.c_double(), C.c_double()
    print('latlong result', api.SULocationGetLatLong(location, C.byref(lat), C.byref(lng)), lat.value, lng.value, flush=True)
    for dictionary in refs('SUModelGetAttributeDictionaries', model):
        print('dictionary', string('SUAttributeDictionaryGetName', dictionary), flush=True)
        n = number('SUAttributeDictionaryGetNumKeys', dictionary)
        keys = (Ref*n)()
        for i in range(n): keys[i] = ref('SUStringCreate')
        call('SUAttributeDictionaryGetKeys', dictionary, Size(n), keys, C.byref(Size()))
        for key in keys:
            key = Ref(key)
            length = number('SUStringGetUTF8Length', key)
            buf = C.create_string_buffer(length+1)
            call('SUStringGetUTF8', key, Size(length+1), buf, C.byref(Size()))
            val = ref('SUTypedValueCreate')
            call('SUAttributeDictionaryGetValue', dictionary, buf.value, C.byref(val))
            typ = number('SUTypedValueGetType', val, C.c_int)
            value = None
            if typ == 5: value = number('SUTypedValueGetDouble', val, C.c_double)
            elif typ == 4: value = number('SUTypedValueGetFloat', val, C.c_float)
            elif typ == 3: value = number('SUTypedValueGetInt32', val, C.c_int32)
            elif typ == 1: value = number('SUTypedValueGetByte', val, C.c_ubyte)
            elif typ == 2: value = number('SUTypedValueGetInt16', val, C.c_int16)
            elif typ == 7: value = number('SUTypedValueGetBool', val, C.c_bool)
            elif typ == 8: value = string('SUTypedValueGetString', val)
            print(' ', buf.value.decode(), typ, value, flush=True)
            call('SUTypedValueRelease', C.byref(val))
            call('SUStringRelease', C.byref(key))
    entities = ref('SUModelGetEntities', model)
    for kind in ['Faces','Groups','Instances']:
        print('root', kind, number('SUEntitiesGetNum'+kind, entities), flush=True)
    for group in refs('SUEntitiesGetGroups', entities):
        print('group', string('SUGroupGetName', group), flush=True)

if __name__ == '__main__':
    api.SUInitialize()
    model = Ref()
    call('SUModelCreateFromFile', C.byref(model), str(Path(__file__).resolve().parents[3] / 'model_2.skp').encode())
    try: inspect(model)
    finally:
        call('SUModelRelease', C.byref(model))
        api.SUTerminate()
