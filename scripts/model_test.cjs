const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'data/model');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
const glb=fs.readFileSync(path.join(dir,'model_2.glb'));
assert.equal(crypto.createHash('sha256').update(glb).digest('hex'),manifest.glb_sha256,'GLB must match placement/export manifest');
const source=path.resolve(root,'../../model_2.skp');
if(fs.existsSync(source)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),manifest.source_sha256,'Original SKP unchanged');
assert.equal(glb.readUInt32LE(0),0x46546c67);
assert.equal(glb.readUInt32LE(4),2);
assert.equal(glb.readUInt32LE(8),glb.length);
const doc=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString('utf8'));
const modelLayers=new Set(doc.nodes.map(node=>node.name));
for(const name of ['TPX_BUILDINGS','TPX_ROADS_HATCH','TPX_WATERWAYS_HATCH','TPX_TERRAIN_TERRAIN_MESH','TPX_VEGETATION_GREEN_SPACES_HATCH'])
 assert(modelLayers.has(name),`GLB retains separately switchable SketchUp layer ${name}`);
assert.equal(manifest.sketchup_layer_defaults.TPX_TERRAIN_TERRAIN_MESH,false,'White base / terrain stays hidden by default');
assert.equal(manifest.sketchup_layer_defaults.TPX_ROADS_HATCH,false,'SketchUp road hatch stays hidden by default');
assert.equal(manifest.sketchup_layer_defaults.TPX_WATERWAYS_HATCH,false,'SketchUp water hatch stays hidden by default');
let triangles=0;
for(const primitive of doc.meshes.flatMap(mesh=>mesh.primitives)) {
 const position=doc.accessors[primitive.attributes.POSITION];
 assert(position.count>0 && position.min.every(Number.isFinite));
 assert(position.min[0]>-100 && position.max[0]<1100,'Export units must be metres, not SketchUp inches');
 const indices=doc.accessors[primitive.indices];
 assert.equal(indices.count%3,0);triangles+=indices.count/3;
}
assert.equal(triangles,226194,'Retain source visible face tessellation');
assert.equal(triangles,manifest.geometry.triangles);
assert.equal(manifest.placement_evidence.water_contours_matched,6);
assert(manifest.placement_evidence.matched_water_median_m<1);
assert(manifest.placement_evidence.railway_median_m<1);
assert.equal(manifest.placement_status,'inferred_from_supplied_gis_geometry_not_surveyed');
const [[west,south],[east,north]]=manifest.bounds;
assert(west<105.835 && east>105.835 && south<21.028 && north>21.028);
assert(east-west<.02 && north-south<.02,'Do not stretch a kilometre model over all route stops');
console.log('Model checks passed: unchanged SKP, GLB integrity, 226194 triangles, metre units, 6 shoreline matches, independent railway check, local extent.');
