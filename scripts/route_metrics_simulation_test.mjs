import assert from 'node:assert/strict';
import {calculateRoadMetrics,decodeRouteShape} from '../src/route-metrics.mjs';

const url=process.env.TOUR_SIMULATION_ROUTE_URL;
assert(url,'Set TOUR_SIMULATION_ROUTE_URL to the local simulation route endpoint');
const points=Array.from({length:18},(_,index)=>({lat:21.02+index*.0001,lng:105.83}));
for(const mode of ['walk','motorbike']) {
  const result=await calculateRoadMetrics(points,mode,{url});
  assert.equal(result.legs.length,17,'Batching must preserve every adjacent leg');
  assert.equal(result.km,8.5);
  assert.equal(result.seconds,5100);
  assert.deepEqual(result.legs[0].coordinates,[[105.83,21.02],[105.83,21.0201]],'Polyline6 decodes to GeoJSON longitude, latitude');
  assert.deepEqual(result.legs[16].coordinates,[[105.83,21.0216],[105.83,21.0217]],'Batch boundary retains the correct last leg');
  assert.deepEqual(result.legs[0].instructions,['Đi theo đường kiểm thử.']);
}
await assert.rejects(calculateRoadMetrics([{lat:21,lng:105},{lat:null,lng:null}],'walk',{url}),/tọa độ/);
assert.throws(()=>decodeRouteShape('_'),/không hợp lệ/,'Truncated encoded geometry is rejected');
await assert.rejects(calculateRoadMetrics(points,'walk',{url:url+'/not-implemented'}),/lỗi 501/);
await assert.rejects(calculateRoadMetrics(points,'walk',{url:'http://127.0.0.1:1/route'}));
console.log('Routing HTTP fixture: walking, motorbike, batching, missing coordinates, HTTP error and unreachable service passed.');
