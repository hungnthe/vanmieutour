/* Locally converted GIS layers. QTG_Diem is deliberately excluded from this public map API. */
(function () {
  'use strict';
  const files = {
    roads: 'roads.geojson',
    water: 'water.geojson',
    railways_area: 'railways-area.geojson',
    railways_context: 'railways-context.geojson',
    boundary: 'boundary.geojson',
    boundary_supplementary: 'boundary-supplementary.geojson'
  };

  async function load() {
    const bundled = window.HERITAGE_GIS_DATA;
    if (bundled?.layers) return {manifest:bundled.manifest || null, layers:bundled.layers};

    const manifestResponse = await fetch('data/gis/manifest.json');
    if (!manifestResponse.ok) throw new Error(`GIS manifest HTTP ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    const ids = (manifest.map_layer_ids || []).filter(id => Object.hasOwn(files, id));
    const pairs = await Promise.all(ids.map(async id => {
      const response = await fetch(`data/gis/${files[id]}`);
      if (!response.ok) throw new Error(`${files[id]} HTTP ${response.status}`);
      const layer = await response.json();
      const expected = manifest.layers?.[id]?.feature_count_exportable;
      if (layer.type !== 'FeatureCollection' || !Array.isArray(layer.features) || layer.features.length !== expected)
        throw new Error(`${files[id]} không khớp manifest`);
      return [id, layer];
    }));
    return {manifest, layers:Object.fromEntries(pairs)};
  }

  window.HeritageGIS = {load, layerIds:Object.keys(files)};
})();
