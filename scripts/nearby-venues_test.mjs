import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {venuesForTour} from '../src/nearby-venues.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const venues=JSON.parse(readFileSync(join(root,'data/nearby-venues.json'),'utf8'));
const sites=JSON.parse(readFileSync(join(root,'data/sites.json'),'utf8'));
const routes=JSON.parse(readFileSync(join(root,'data/routes.json'),'utf8'));
const siteIds=new Set(sites.map(site=>site.id));
assert.equal(venues.length,212,'Only shop, food, drink and nightlife places are shown');
assert.equal(new Set(venues.map(venue=>`${venue.name}|${venue.lat}|${venue.lng}`)).size,venues.length,
  'One physical venue appears once even when near several sites');
for(const venue of venues) {
  assert(Number.isFinite(venue.lat) && Number.isFinite(venue.lng));
  assert(venue.near.length>0);
  for(const link of venue.near) {
    assert(siteIds.has(link.siteId),`Unknown site ${link.siteId}`);
    assert(link.distanceM>=0 && link.distanceM<=300);
  }
}
assert.equal(venuesForTour(venues,[]).length,0,'No selected stops means no POI layer');
for(const siteId of siteIds) {
  const nearby=venuesForTour(venues,[siteId]);
  assert(nearby.length>0,`${siteId} has no nearby venues`);
  assert(nearby.every(venue=>venue.nearSelected.every(link=>link.siteId===siteId)));
}
for(const route of routes) {
  const nearby=venuesForTour(venues,route.sites);
  assert(nearby.length>0,`${route.id} has no nearby venues`);
  assert(nearby.every(venue=>venue.nearSelected.every(link=>route.sites.includes(link.siteId))));
}
const vanMieu=venuesForTour(venues,['van_mieu']);
const baNanh=venuesForTour(venues,['ba_nanh']);
const union=venuesForTour(venues,['van_mieu','ba_nanh']);
assert(union.length<=vanMieu.length+baNanh.length,'Shared venues are deduplicated in custom tours');
assert(union.some(venue=>venue.nearSelected.length===2),'Shared venues retain both selected-site links');
console.log(`Nearby venue checks passed: ${venues.length} unique places, ${siteIds.size} mapped sites, ${routes.length} preset routes and custom tours.`);
