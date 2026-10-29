import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculateRoadMetrics} from '../src/route-metrics.mjs';

const sites=JSON.parse(fs.readFileSync(new URL('../data/sites.json',import.meta.url),'utf8'));
const byId=Object.fromEntries(sites.map(site=>[site.id,site]));
const ids=['van_mieu','kham_duc_dinh','thanh_mien','duc_thanh_tran','tien_tich','kham_duc_den','thai_kieu'];
for (const mode of ['walk','motorbike']) {
  let request;
  const result=await calculateRoadMetrics(ids.map(id=>byId[id]),mode,{fetchImpl:async (url,options)=>{
    request=JSON.parse(options.body);
    return {ok:true,json:async()=>({trip:{status:0,legs:Array.from({length:ids.length-1},()=>({summary:{length:0.2,time:120},shape:'??AA',maneuvers:[{instruction:'Đi theo đường.'}]}))}})};
  }});
  assert.deepEqual(request.locations.map(({lat,lon})=>[lat,lon]),ids.map(id=>[byId[id].lat,byId[id].lng]));
  assert.equal(request.costing,mode==='walk'?'pedestrian':'motor_scooter');
  assert.equal(result.legs.length,ids.length-1);
  assert(Math.abs(result.km-1.2)<1e-9);
  assert.equal(result.seconds,720);
}
console.log('Custom route checks passed for all six GIS points and both travel modes (mocked routing service).');
