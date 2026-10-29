// Local stand-in for the Valhalla /route response consumed by this app.
// Length/time values are fixtures, not geographic measurements.
const http = require('node:http');
function encodeShape(points) {
  let lastLat=0,lastLon=0,result='';
  function encode(delta) {
    let value=delta<0?~(delta<<1):delta<<1;
    while(value>=32){result+=String.fromCharCode(((value&31)|32)+63);value>>=5;}
    result+=String.fromCharCode(value+63);
  }
  for(const point of points) {
    const lat=Math.round(point.lat*1e6),lon=Math.round(point.lon*1e6);
    encode(lat-lastLat);encode(lon-lastLon);lastLat=lat;lastLon=lon;
  }
  return result;
}
const server = http.createServer(async (req,res) => {
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  if(req.method!=='POST' || req.url!=='/route') return send(501,{error:'Not implemented'});
  let body=req.body;
  if(!body) {
    let raw=''; for await(const part of req) raw+=part;
    try { body=JSON.parse(raw); } catch { return send(400,{error:'Invalid JSON'}); }
  }
  if(typeof body==='string') { try { body=JSON.parse(body); } catch { return send(400,{error:'Invalid JSON'}); } }
  if(!Array.isArray(body.locations) || body.locations.length<2 || !['pedestrian','motor_scooter'].includes(body.costing)) return send(400,{error:'Invalid route request'});
  if(body.language!=='vi-VN') return send(400,{error:'Expected Vietnamese route instructions'});
  if(body.locations.length>10) return send(400,{error:'Exceeded max locations: 10'});
  const legs=body.locations.slice(1).map((end,index)=>({summary:{length:0.5,time:300},shape:encodeShape([body.locations[index],end]),maneuvers:[{instruction:'Đi theo đường kiểm thử.'}]}));
  return send(200,{trip:{status:0,status_message:'Found route between points',legs}});
});
server.listen(process.env.PORT || 4500);
