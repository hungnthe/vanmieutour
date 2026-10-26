const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const expected = {
  'data/sites.json':'DAC003DFDB10561E479CE1FB4341F7E7DBF7C1F8DF34BA06B1A76572EAF716E1',
  'data/routes.json':'9DFD225D4F9E43035058D7AF5DCCB3D3842F504EC0BABBAD4331F5E2D1F9CE49',
  'data.js':'9370C39DACC8F63E040F8A3A0713B4C74CCDAAC633B2ACC211E23659731FCE94',
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
assert.equal(sites.filter(located).length,25);
assert.equal(sites.filter(s=>!located(s)).length,7);
assert.equal(routes.filter(r=>r.mode==='walk').length,3);
assert.equal(routes.filter(r=>r.mode==='motorbike').length,3);
for (const route of routes) {
  const segments = routeSegments(route,byId);
  assert.equal(segments.flat().length,route.id==='R03'?4:route.sites.length);
  assert.equal(segments.length,1);
  assert.equal(route.routing_status,'point_order_only');
}
// Unknown intermediate stops cannot be bridged, even for a future route.
const split = routeSegments({sites:['van_mieu','ho_van','kham_duc_dinh','ngoc_ho','y_mieu']},byId);
assert.equal(split.length,2);
assert.equal(split[0].length,2);
assert.equal(split[1].length,2);
const style = JSON.parse(fs.readFileSync(path.join(root,'map-style.json')));
assert.equal(style.layers.filter(l=>l.type==='fill-extrusion').length,1,'Only one building extrusion layer');
assert(style.layers.some(l=>l['source-layer']==='transportation' && l.type==='line'));
console.log('Data checks passed: unchanged research hashes, 25/7 points, 3+3 routes, no bridge over missing stops, real road/building layers.');
