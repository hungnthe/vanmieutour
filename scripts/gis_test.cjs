const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const gis = path.join(root,'data','gis');
const manifest = JSON.parse(fs.readFileSync(path.join(gis,'manifest.json'),'utf8'));
const expected = {roads:1107,water:13,railways_area:87,railways_context:288,boundary:1,boundary_supplementary:1,heritage_points_review:35};

assert.equal(manifest.status,'PASS_WITH_WARNINGS');
assert.deepEqual(manifest.map_layer_ids,['roads','water','railways_area','railways_context','boundary','boundary_supplementary']);
assert.deepEqual(manifest.audit_only_layer_ids,['heritage_points_review']);
assert.equal(manifest.target_crs,'EPSG:4326');
assert.equal(manifest.layers.boundary_supplementary.source_crs_authority,'EPSG:32648');
assert.equal(manifest.boundary_comparison.status,'close');
assert(manifest.boundary_comparison.distance_m < 5);
assert.equal(manifest.route_geometry_created,false);

for (const [id,count] of Object.entries(expected)) {
  const info=manifest.layers[id];
  assert.equal(info.feature_count_read,count,`${id} source record count`);
  assert.equal(info.feature_count_exportable,count,`${id} exported record count`);
  assert.equal(info.feature_count_error,0,`${id} geometry validation`);
  assert.equal(info.feature_count_duplicate_geometry,0,`${id} exact duplicate check`);
  assert(info.source_file_integrity.shp_declared_length_matches);
  assert(info.source_file_integrity.shx_declared_length_matches);
  assert(info.source_file_integrity.shx_offsets_match_shp);
  assert.equal(info.source_file_integrity.dbf_record_count,count);
  const collection=JSON.parse(fs.readFileSync(path.join(gis,info.output_file),'utf8'));
  assert.equal(collection.type,'FeatureCollection');
  assert.equal(collection.features.length,count);
  assert(collection.features.every(feature=>feature.geometry && feature.geometry.coordinates));
  if (id==='heritage_points_review') assert(collection.features.every(feature=>feature.properties._review_only===true));
}

assert(manifest.layers.boundary.source_format_warnings.length > 0,'Record the source polygon ring-orientation warning');
const crosswalk=JSON.parse(fs.readFileSync(path.join(root,'artifacts','gis-audit','site-crosswalk.json'),'utf8'));
assert.equal(crosswalk.length,35);
assert(crosswalk.every(row=>row.identity_status==='needs_human_review' && row.public_map_status==='audit_only_not_rendered'));
const canonicalSites=JSON.parse(fs.readFileSync(path.join(root,'data','sites.json'),'utf8'));
assert.equal(canonicalSites.length,32,'Canonical site list is not padded from GIS candidates');
console.log('GIS checks passed: 7 Shapefiles, CRS transform, SHP/SHX/DBF indexes, 35 audit-only points, 6 map overlays, 0 invented route lines.');
