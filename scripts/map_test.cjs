const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname,'..');
const dom = new JSDOM('<div id="map"></div><div id="details"></div>',{runScripts:'outside-only'});
const {window} = dom;
const sites = JSON.parse(fs.readFileSync(path.join(root,'data/sites.json')));
const routes = JSON.parse(fs.readFileSync(path.join(root,'data/routes.json')));
const timers = new Map();
let timerId = 0;
window.setTimeout = (callback,ms) => {timers.set(++timerId,{callback,ms});return timerId;};
window.clearTimeout = id => timers.delete(id);
window.matchMedia = () => ({matches:false});
window.HTMLCanvasElement.prototype.getContext = () => null;
const layers=[];
class Events {
  constructor() {this.events={};}
  on(name,callback) {(this.events[name] ||= []).push(callback);return this;}
  emit(name,arg={}) {for(const callback of this.events[name] || []) callback(arg);}
  addTo(map) {this.map=map;map.addLayer?.(this);return this;}
}
class RasterMap extends Events {
  constructor() {super();this.zoom=15;this.layers=new Set();this.panes={};}
  setView(center,zoom) {this.zoom=zoom;return this;}
  fitBounds() {return this;}
  addLayer(layer) {this.layers.add(layer);return this;}
  hasLayer(layer) {return this.layers.has(layer);}
  removeLayer(layer) {layer.removed=true;this.layers.delete(layer);}
  createPane(name) {this.panes[name]={style:{}};return this.panes[name];}
  getPane(name) {return this.panes[name];}
  getZoom() {return this.zoom;}
  remove() {this.removed=true;}
  invalidateSize() {}
}
window.L = {
  map:()=>new RasterMap(),control:{scale:()=>new Events()},
  divIcon:options=>options,
  marker:(latlng,options)=>Object.assign(new Events(),{latlng,options,setZIndexOffset(){}}),
  layerGroup:()=>Object.assign(new Events(),{layers:[],addLayer(layer){this.layers.push(layer);return this;},clearLayers(){this.layers=[];}}),
  polyline:()=>new Events(),
  geoJSON:(data,options)=>Object.assign(new Events(),{data,options}),
  tileLayer:(url,options)=>{const layer=Object.assign(new Events(),{url,options});layers.push(layer);return layer;}
};
window.eval(fs.readFileSync(path.join(root,'map-engine.js'),'utf8'));
const statuses=[];
const engine = new window.HeritageMap({sites,onStatus:state=>statuses.push(state),makeMarker:site=>{
  const element=window.document.createElement('div');
  element.innerHTML='<span class="marker-number"></span>';
  element.dataset.color='#123456';
  return element;
}});
engine.start();
assert.equal(engine.kind,'raster','Missing MapLibre uses WebGL-free fallback');
assert.equal(engine.markers.size,25);
engine.setGISData({roads:{type:'FeatureCollection',features:[]}});
const roadOverlay=engine.gisLeafletLayers.get('roads');
assert(roadOverlay && !engine.map.hasLayer(roadOverlay),'GIS overlays start hidden to avoid duplicating the OSM basemap');
engine.setGISVisibility('roads',true);
assert(engine.map.hasLayer(roadOverlay),'Local GIS roads can be enabled in the Leaflet fallback');
engine.setGISVisibility('roads',false);
assert(!engine.map.hasLayer(roadOverlay),'Local GIS overlays can be hidden in the fallback');
engine.setGISVisibility('roads',true);
assert(engine.map.hasLayer(roadOverlay),'Local GIS overlays can be shown again in the fallback');
assert(layers[0].url.includes('openstreetmap.de'));
engine.render(routes.find(r=>r.id==='R03'),'ngoc_ho');
assert.equal(engine.container.dataset.routeStops,'4');
assert.equal(engine.markers.get('ngoc_ho').element.classList.contains('dim'),false,'Selection outside a route remains visible');
assert(!engine.markers.has('kham_duc_dinh'));
layers[0].emit('tileload');
assert.equal(statuses.at(-1).level,'fallback');
const messages=statuses.length;
layers[0].emit('tileload');
assert.equal(statuses.length,messages,'Do not announce the same status for every tile');
// Restart cancels old timers, removes the old map, and retains the selected route.
const oldMap=engine.map, staleTile=layers[0];
engine.start();
assert(oldMap.removed);
assert.equal(engine.markers.size,25);
assert.equal(engine.container.dataset.routeStops,'4');
staleTile.emit('tileload');
assert.equal(engine.container.dataset.streets,'false','An old map cannot mark the replacement ready');
const active=layers.at(-1);
active.emit('tileerror');active.emit('tileerror');active.emit('tileerror');
assert(layers.at(-1).url.includes('tile.openstreetmap.org'),'First provider fails over to independent raster host');
layers.at(-1).emit('tileerror');layers.at(-1).emit('tileerror');layers.at(-1).emit('tileerror');
assert.equal(statuses.at(-1).level,'error');
assert.equal(engine.container.dataset.streets,'false');
assert.equal(engine.markers.size,25,'Keep real-coordinate pins when every tile provider fails');
assert.equal(engine.container.dataset.routeStops,'4');
engine.clear();
assert.equal(timers.size,0,'Disposed map cannot trigger a stale fallback timeout');

// Exercise vector-layer switches without network tiles or WebGL.
const vectorState=new Map();
const vectorLayerIds=['background','road_minor','building-3d','gis-water-fill','gis-railways_area','gis-railways_context'];
const vectorStyleLayers=vectorLayerIds.map(id=>({id,type:id==='background'?'background':id==='building-3d'?'fill-extrusion':'line',source:id.startsWith('gis-')?undefined:'openmaptiles',layout:{}}));
const vectorMap={
 isStyleLoaded:()=>true,
 getStyle:()=>({layers:vectorStyleLayers}),
 getLayer:id=>vectorStyleLayers.find(layer=>layer.id===id),
 getLayoutProperty:(id,name)=>vectorMap.getLayer(id).layout[name],
 setLayoutProperty:(id,name,value)=>{vectorMap.getLayer(id).layout[name]=value;vectorState.set(`${id}:${name}`,value);},
 triggerRepaint(){}
};
engine.kind='vector';engine.ready=true;engine.map=vectorMap;engine.baseVisible=true;engine.osmBuildingsVisible=false;engine.sketchupEnabled=false;
engine.modelLayer={visible:false,setVisible(value){this.visible=value;},setGroupVisible(){}};
engine.applyMapLayerVisibility();
assert.equal(vectorState.get('building-3d:visibility'),'none','OSM 3D blocks start hidden');
engine.setOSMBuildingVisibility(true);
assert.equal(vectorState.get('building-3d:visibility'),'visible','OSM buildings can be shown independently');
engine.setSketchUpVisibility(true);
assert.equal(engine.modelLayer.visible,true,'SketchUp can be enabled while the model is loaded');
assert.equal(vectorState.get('building-3d:visibility'),'none','Enabling SketchUp hides the duplicate OSM 3D buildings');
engine.setGISVisibility('railways',true);
assert.equal(vectorState.get('gis-railways_area:visibility'),'visible');
assert.equal(vectorState.get('gis-railways_context:visibility'),'visible','Railway GIS control toggles both GIS railway layers');
engine.setMapBaseVisibility(false);
assert.equal(vectorState.get('road_minor:visibility'),'none','OSM base switch hides OSM roads');
assert.equal(vectorState.get('gis-railways_area:visibility'),'visible','GIS overlay switches are independent from OSM base');
dom.window.close();
console.log('Map checks passed: raster failover and markers; independent OSM/GIS switches; exclusive OSM/SketchUp 3D; grouped railway overlays.');
