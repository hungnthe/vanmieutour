// Coordinates are public place centroids. The routing service does not verify entrances.
export const ROUTING_URL = 'https://valhalla1.openstreetmap.de/route';
const MAX_LOCATIONS = 10; // Public Valhalla demo accepts at most 10 locations per request.

// Valhalla returns polyline coordinates in latitude, longitude at 1e-6 precision.
export function decodeRouteShape(encoded) {
  if(typeof encoded!=='string' || !encoded.length) throw new Error('Thiếu hình dạng tuyến đường.');
  let index=0,lat=0,lng=0;
  const points=[];
  function readDelta() {
    let value=0,shift=0,part;
    do {
      if(index>=encoded.length || shift>30) throw new Error('Hình dạng tuyến đường không hợp lệ.');
      part=encoded.charCodeAt(index++)-63;
      if(part<0 || part>63) throw new Error('Hình dạng tuyến đường không hợp lệ.');
      value|=(part&31)<<shift; shift+=5;
    } while(part>=32);
    return value&1 ? ~(value>>1) : value>>1;
  }
  while(index<encoded.length) {
    lat+=readDelta(); lng+=readDelta();
    const point=[lng/1e6,lat/1e6];
    if(Math.abs(point[0])>180 || Math.abs(point[1])>90) throw new Error('Tọa độ tuyến đường không hợp lệ.');
    points.push(point);
  }
  if(points.length<2) throw new Error('Hình dạng tuyến đường không đủ điểm.');
  return points;
}

export async function calculateRoadMetrics(stops, mode, {signal, fetchImpl = globalThis.fetch, url = ROUTING_URL} = {}) {
  if (!Array.isArray(stops) || stops.length < 2) throw new Error('Cần ít nhất hai điểm để tính.');
  if (!stops.every(site => Number.isFinite(site?.lat) && Number.isFinite(site?.lng))) throw new Error('Có điểm chưa có tọa độ.');
  if (!['walk','motorbike'].includes(mode)) throw new Error('Phương tiện không hợp lệ.');
  if (typeof fetchImpl !== 'function') throw new Error('Trình duyệt không hỗ trợ kết nối dịch vụ.');

  const legs=[];
  // Adjacent batches share an endpoint; a leg is included exactly once.
  for (let start=0;start<stops.length-1;start+=MAX_LOCATIONS-1) {
    const batch=stops.slice(start,start+MAX_LOCATIONS);
    const response=await fetchImpl(url,{
      method:'POST',signal,headers:{'Content-Type':'application/json','X-Client-Id':'dau-chan-di-san-local'},
      body:JSON.stringify({locations:batch.map(site=>({lat:site.lat,lon:site.lng,type:'break'})),
        costing:mode==='walk'?'pedestrian':'motor_scooter',units:'kilometers',language:'vi-VN'})
    });
    if(!response.ok) throw new Error(`Dịch vụ tuyến đường trả lỗi ${response.status}.`);
    const result=await response.json();
    const data=result?.trip?.legs;
    if(result?.trip?.status!==0 || !Array.isArray(data) || data.length!==batch.length-1) throw new Error('Dịch vụ không tìm được đủ các chặng.');
    for(const leg of data) {
      const km=leg?.summary?.length,seconds=leg?.summary?.time;
      if(!Number.isFinite(km)||km<0||!Number.isFinite(seconds)||seconds<0) throw new Error('Kết quả tuyến đường không hợp lệ.');
      const coordinates=decodeRouteShape(leg.shape);
      const instructions=Array.isArray(leg.maneuvers) ? leg.maneuvers.map(item=>item.instruction).filter(item=>typeof item==='string' && item.trim()) : [];
      legs.push({km,seconds,coordinates,instructions});
    }
  }
  return {legs,km:legs.reduce((sum,leg)=>sum+leg.km,0),seconds:legs.reduce((sum,leg)=>sum+leg.seconds,0)};
}
