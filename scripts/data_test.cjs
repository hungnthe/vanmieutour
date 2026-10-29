const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const expected = {
  'data/sites.json':'FDF1F17EFDE379010AB03C996C80BEF7B0CC25C229F6983D36A48D8D7C1C7B3C',
  'data/routes.json':'1D6F71055B3F017AEB4E50821EDFB6885265F45A0829D0390BB726E653B365FB',
  'data.js':'3EB5C43D9ABEE7DE380B018AC19C18C8C220205A011909D17371E454D8F18F4B',
  'references/original-tour-map.pdf':'28AA8290CEA870F2348D060F6DB06A867F5E8C62B8457AE152F0A5958E84DBBC'
};
for (const [file,hash] of Object.entries(expected)) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex').toUpperCase(),hash,`Research source changed: ${file}`);
}
const sandbox = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'map-engine.js'),'utf8'),sandbox);
const {routeSegments,located} = sandbox.window.HeritageGeometry;
const sites = JSON.parse(fs.readFileSync(path.join(root,'data/sites.json')));
const routes = JSON.parse(fs.readFileSync(path.join(root,'data/routes.json')));
const byId = Object.fromEntries(sites.map(s=>[s.id,s]));
assert.equal(sites.filter(located).length,32);
assert.equal(sites.filter(s=>!located(s)).length,0);
const gis=JSON.parse(fs.readFileSync(path.join(root,'data/gis/heritage-points-review.geojson')));
const sourceByRecord=Object.fromEntries(gis.features.map(f=>[f.id,f]));
for (const site of sites.filter(s=>s.coord_status==='gis_reference')) {
  const feature=sourceByRecord[site.coordinate_record];
  assert(feature, `${site.name} has a source record`);
  assert.deepEqual([site.lng,site.lat],feature.geometry.coordinates);
}
assert.equal(sites.filter(s=>s.coord_status==='gis_reference').length,6);
assert.equal(byId.trung_kinh.coord_status,'osm_reference');
assert.equal(byId.trung_kinh.coordinate_source,'https://vietnam-pagodas.vercel.app/vi/chua/dinh-trung-kinh');
assert.deepEqual([byId.trung_kinh.lat,byId.trung_kinh.lng],[21.01686,105.83927]);
assert.equal(routes.filter(r=>r.mode==='walk').length,3);
assert.equal(routes.filter(r=>r.mode==='motorbike').length,3);
for (const route of routes) {
  const segments = routeSegments(route,byId);
  assert.equal(segments.flat().length,route.sites.length);
  assert.equal(segments.length,1);
  assert.equal(route.routing_status,'point_order_only');
}
// Unknown intermediate stops cannot be bridged, even for a future route.
const split = routeSegments({sites:['van_mieu','ho_van','unknown_site','ngoc_ho','y_mieu']},byId);
assert.equal(split.length,2);
assert.equal(split[0].length,2);
assert.equal(split[1].length,2);
const style = JSON.parse(fs.readFileSync(path.join(root,'map-style.json')));
assert.equal(style.layers.filter(l=>l.type==='fill-extrusion').length,1,'Only one building extrusion layer');
assert(style.layers.some(l=>l['source-layer']==='transportation' && l.type==='line'));
console.log('Data checks passed: 32 points with sources, 3+3 routes, no bridge over missing stops, real road/building layers.');
