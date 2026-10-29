/* Map rendering only. Heritage coordinates and route order remain in data.js.
 * Vector streets/buildings: OpenFreeMap / OpenMapTiles / OpenStreetMap.
 * Raster fallback: OSM DE, then OSM Standard. No invented map geometry.
 */
(function () {
  'use strict';
  const located = s => s && Number.isFinite(s.lat) && Number.isFinite(s.lng);
  // A missing stop breaks the schematic; never silently bridge an unknown stop.
  function routeSegments(route, byId) {
    const segments = [];
    let segment = [];
    for (const id of route?.sites || []) {
      const site = byId[id];
      if (located(site)) segment.push([site.lng, site.lat]);
      else { if (segment.length > 1) segments.push(segment); segment = []; }
    }
    if (segment.length > 1) segments.push(segment);
    return segments;
  }
  window.HeritageGeometry = {located, routeSegments};

  class HeritageMap {
    constructor(options) {
      Object.assign(this, options);
      this.container = document.getElementById('map');
      this.byId = Object.fromEntries(this.sites.map(s => [s.id,s]));
      this.markers = new Map();
      this.mode = '2d';
      this.route = null;
      this.selected = 'van_mieu';
      this.kind = 'loading';
      this.generation = 0;
      this.timers = new Set();
      this.gisData = null;
      this.gisGroups = {roads:['roads'],water:['water'],railways:['railways_area','railways_context'],boundaries:['boundary','boundary_supplementary']};
      this.gisVisibility = Object.fromEntries(Object.keys(this.gisGroups).map(group =>
        [group,document.querySelector(`[data-gis-group="${group}"]`)?.checked === true]));
      this.gisLeafletLayers = new Map();
      this.baseVisible = document.querySelector('[data-map-base]')?.checked !== false;
      this.osmBuildingsVisible = Boolean(document.querySelector('[data-map-buildings]')?.checked);
      this.markersVisible = document.querySelector('[data-map-markers]')?.checked !== false;
      this.sketchupEnabled = Boolean(document.querySelector('[data-map-sketchup]')?.checked);
      this.sketchupLayerVisibility = Object.fromEntries([...document.querySelectorAll('[data-sketchup-layer]')].map(input=>[input.dataset.sketchupLayer,input.checked]));
      this.modelState = 'idle';
      this.modelPromise = null;
      this.visibleNearbyVenues = [];
      this.venuePopup = null;
    }
    later(callback, delay) {
      const token = setTimeout(() => { this.timers.delete(token); callback(); }, delay);
      this.timers.add(token);
      return token;
    }
    status(message, level = 'loading') {
      this.container.dataset.renderer = this.kind;
      this.container.dataset.status = level;
      const statusKey = `${this.kind}:${level}:${message}`;
      if (this.lastStatus === statusKey) return;
      this.lastStatus = statusKey;
      this.onStatus({message,level,renderer:this.kind});
    }
    clear() {
      this.generation++;
      this.venuePopup?.remove();
      this.venuePopup = null;
      this.venueLayer = null;
      this.modelAbort?.abort();
      this.modelLayer = null;
      this.modelPromise = null;
      this.modelState = 'idle';
      this.container.dataset.model = 'idle';
      this.timers.forEach(clearTimeout);
      this.timers.clear();
      this.markers.clear();
      this.gisLeafletLayers.clear();
      if (this.map) this.map.remove();
      this.map = null;
      this.ready = false;
      this.baseReady = false;
      this.container.replaceChildren();
      this.container.dataset.ready = 'false';
      this.container.dataset.moving = 'false';
      this.container.dataset.streets = 'false';
      this.container.dataset.buildings = 'hidden';
      this.container.dataset.nearbyVenues = '0';
      this.container.dataset.nearbyLayer = 'missing';
    }
    start() {
      if (!window.maplibregl) { this.fallback('Thư viện 2.5D chưa tải được'); return; }
      const canvas = document.createElement('canvas');
      let gl;
      try { gl = canvas.getContext('webgl2'); } catch (_) { /* Raster needs no WebGL. */ }
      if (!gl) { this.fallback('Thiết bị không hỗ trợ WebGL 2'); return; }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      this.clear();
      this.kind = 'vector';
      this.status('Đang tải đường phố Hà Nội…');
      const generation = this.generation;
      const current = () => generation === this.generation;
      let tileErrors = 0;
      try {
        const map = this.map = new maplibregl.Map({
          container:this.container, style:window.HERITAGE_MAP_STYLE || 'map-style.json',
          center:[105.8356,21.0225], zoom:15, pitch:0, bearing:0,
          minZoom:11, maxZoom:19, canvasContextAttributes:{antialias:true},
          attributionControl:{compact:true}
        });
        map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');
        map.getCanvas().addEventListener('webglcontextlost', () => {
          if (current()) this.fallback('WebGL bị gián đoạn');
        });
        this.sites.filter(located).forEach(site => {
          const element = this.makeMarker(site);
          element.style.display = this.markersVisible ? '' : 'none';
          const marker = new maplibregl.Marker({element,anchor:'bottom'})
            .setLngLat([site.lng,site.lat]).addTo(map);
          this.markers.set(site.id,{marker,element});
        });
        map.on('error', e => {
          if (!current()) return;
          console.warn('Nguồn bản đồ:',e.error?.message || e.error || e);
          if (e.sourceId === 'openmaptiles') tileErrors++;
          // Sprite/glyph/optional layer errors must not obscure a usable map.
          if ((!e.sourceId && !map.getStyle()) || tileErrors >= 6) {
            this.later(() => {
              if (current() && (!this.baseReady || !this.hasStreets()))
                this.fallback('Nguồn bản đồ vector đang gián đoạn');
            },500);
          }
        });
        map.on('load', () => {
          if (!current()) return;
          this.ready = true;
          this.container.dataset.ready = 'true';
          map.addSource('heritage-route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
          this.attachMapLibreGIS();
          map.addLayer({id:'heritage-route',type:'line',source:'heritage-route',
            layout:{'line-join':'round','line-cap':'round'},
            paint:{'line-width':5,'line-opacity':0.95,'line-color':'#38846b'}});
          this.attachNearbyVenueLayers();
          this.updateNearbyVenues();
          this.setPerspective(this.mode, false);
          this.applyMapLayerVisibility();
          if (this.sketchupEnabled) this.loadSketchUp();
          this.render(this.route,this.selected);
          this.route?.roadSegments?.length ? this.fitRoadRoute(this.route.roadSegments) : this.route ? this.fitRoute(this.route) : this.overview();
          this.checkStreets();
        });
        map.on('idle', () => {
          if (!current()) return;
          this.attachMapLibreGIS();
          if (this.attachNearbyVenueLayers()) this.updateNearbyVenues();
          this.applyMapLayerVisibility();
          this.checkStreets();
        });
        map.on('movestart', () => { if (current()) this.container.dataset.moving = 'true'; });
        map.on('moveend', () => {
          if (!current()) return;
          this.container.dataset.moving = 'false';
          this.container.dataset.zoom = map.getZoom().toFixed(2);
          this.container.dataset.pitch = map.getPitch().toFixed(0);
        });
        this.later(() => { if (current() && !this.baseReady) this.fallback('Nguồn vector tải quá lâu'); },18000);
        this.render(this.route,this.selected);
      } catch (error) {
        console.warn('Không khởi tạo được WebGL:',error);
        this.fallback('Không khởi tạo được bản đồ 2.5D');
      }
    }
    hasStreets() {
      if (!this.map?.isStyleLoaded()) return false;
      if (!this.baseVisible) return true;
      const roads = this.map.getStyle().layers.filter(l => l.type === 'line' && l['source-layer'] === 'transportation').map(l => l.id);
      return roads.length > 0 && this.map.queryRenderedFeatures({layers:roads}).length > 0;
    }
    checkStreets() {
      if (!this.ready || this.baseReady) return;
      if (!this.baseVisible) {
        this.baseReady = true;
        this.container.dataset.streets = 'false';
        this.status('Nền OSM tắt · các lớp GIS đang hoạt động','ready');
        this.onReady?.();
        return;
      }
      if (!this.hasStreets()) return;
      this.baseReady = true;
      this.container.dataset.streets = 'true';
      this.status(this.modelState === 'error' ? 'Mô hình chưa tải được · bản đồ 2D vẫn hoạt động' : this.sketchupEnabled && this.modelState === 'ready' ? '3D Văn Miếu · vị trí suy ra từ GIS' : `Đường phố OSM · ${this.sites.filter(located).length} vị trí tham khảo`,this.modelState === 'error' ? 'model-error' : 'ready');
      this.onReady?.();
    }
    fallback(reason = 'Đã chọn nền 2D') {
      this.clear();
      this.baseReady = false;
      this.kind = 'raster';
      this.mode = '2d';
      this.container.dataset.streets = 'false';
      this.container.dataset.pitch = '0';
      this.status(`${reason} · Đang tải nền 2D…`,'loading');
      if (!window.L) {
        this.status('Không tải được thư viện bản đồ. Hãy tải lại; danh sách di tích vẫn dùng được.','error');
        return;
      }
      const generation = this.generation;
      const current = () => generation === this.generation;
      const map = this.map = L.map(this.container,{zoomControl:false,attributionControl:true,minZoom:11,maxZoom:19});
      map.setView([21.0225,105.8356],15);
      map.createPane('heritageGIS');
      map.getPane('heritageGIS').style.zIndex = '390';
      L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
      this.sites.filter(located).forEach(site => {
        const element = this.makeMarker(site);
        element.style.display = this.markersVisible ? '' : 'none';
        const marker = L.marker([site.lat,site.lng],{
          icon:L.divIcon({html:element,className:'heritage-leaflet-marker',iconSize:[36,44],iconAnchor:[18,44]}),
          keyboard:false // The inner marker is already a keyboard-accessible button.
        }).addTo(map);
        this.markers.set(site.id,{marker,element});
      });
      this.line = L.layerGroup().addTo(map);
      this.venueLayer = L.layerGroup().addTo(map);
      this.ready = true;
      this.container.dataset.ready = 'true';
      this.container.dataset.nearbyLayer = 'ready';
      this.attachLeafletGIS();
      this.render(this.route,this.selected);
      this.updateNearbyVenues();
      this.route?.roadSegments?.length ? this.fitRoadRoute(this.route.roadSegments) : this.route ? this.fitRoute(this.route) : this.overview();
      const providers = [
        {name:'OSM DE',url:'https://tile.openstreetmap.de/{z}/{x}/{y}.png',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.openstreetmap.de/germanstyle.html">OSM DE</a>'},
        {name:'OpenStreetMap',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
      ];
      let attempt = 0;
      const loadProvider = index => {
        const ticket = ++attempt;
        if (!current()) return;
        this.baseReady = false;
        this.container.dataset.streets = 'false';
        if (this.tiles) map.removeLayer(this.tiles);
        if (!this.baseVisible) {
          this.tiles=null;this.baseReady=true;this.container.dataset.streets='false';
          this.status('Đã tắt nền OSM · các lớp GIS đang hoạt động','ready');
          return;
        }
        const provider = providers[index];
        if (!provider) {
          this.status('Các nguồn nền đều không tải được. Pin vẫn tương tác được; kiểm tra mạng rồi thử lại.','error');
          return;
        }
        this.status(`${reason} · Đang tải nền 2D ${provider.name}…`,'loading');
        let loaded = 0, errors = 0;
        const next = () => { if (current() && ticket === attempt) loadProvider(index+1); };
        this.tiles = L.tileLayer(provider.url,{maxZoom:19,attribution:provider.attribution});
        this.tiles.on('loading', () => { loaded = 0; errors = 0; this.container.dataset.tilesPending = 'true'; });
        this.tiles.on('load', () => { if (current() && ticket === attempt) this.container.dataset.tilesPending = 'false'; });
        this.tiles.on('tileload', () => {
          if (!current() || ticket !== attempt) return;
          loaded++;
          this.baseReady = true;
          this.container.dataset.streets = 'true';
          this.status(`${reason} · Nền 2D ${provider.name}`,'fallback');
          this.onReady?.();
        });
        this.tiles.on('tileerror', () => { if (++errors >= 3 && loaded === 0) next(); });
        this.tiles.addTo(map);
        this.later(() => { if (!loaded) next(); },10000);
      };
      loadProvider(0);
      map.on('movestart', () => { if (current()) this.container.dataset.moving = 'true'; });
      map.on('moveend', () => { if (current()) {this.container.dataset.moving = 'false';this.container.dataset.zoom = map.getZoom().toFixed(2);} });
    }
    render(route, selected) {
      this.route = route;
      this.selected = selected;
      for (const [id,{element,marker}] of this.markers) {
        element.style.display = this.markersVisible ? '' : 'none';
        const order = route ? route.sites.indexOf(id) : -1;
        element.classList.toggle('selected',selected === id);
        element.classList.toggle('in-route',order >= 0);
        element.classList.toggle('dim',Boolean(route && order < 0 && selected !== id));
        element.style.setProperty('--marker',order >= 0 ? route.color : element.dataset.color);
        element.querySelector('.marker-number').textContent = order >= 0 ? order+1 : '';
        element.setAttribute('aria-label',`${order >= 0 ? `Điểm ${order+1}. ` : ''}Xem chi tiết ${this.byId[id].name}`);
        if (this.kind === 'raster') marker.setZIndexOffset(selected === id ? 1000 : order >= 0 ? 500 : 0);
      }
      // Only draw geometry supplied by the routing service; no straight-line fallback.
      const segments = route?.roadSegments || [];
      this.container.dataset.routeSegments = segments.length;
      this.container.dataset.routeGeometry = segments.length ? 'road' : 'none';
      this.container.dataset.routeStops = route ? route.sites.filter(id => located(this.byId[id])).length : 0;
      if (!this.ready) return;
      if (this.kind === 'vector') {
        this.map.getSource('heritage-route')?.setData({type:'FeatureCollection',features:segments.map(coordinates => ({
          type:'Feature',properties:{},geometry:{type:'LineString',coordinates}
        }))});
        if (this.map.getLayer('heritage-route')) this.map.setPaintProperty('heritage-route','line-color',route?.color || '#38846b');
      } else {
        this.line.clearLayers();
        segments.forEach(segment => L.polyline(segment.map(([lng,lat]) => [lat,lng]),{
          color:route.color,weight:5,opacity:0.95,interactive:false
        }).addTo(this.line));
      }
    }
    attachNearbyVenueLayers() {
      if (this.kind !== 'vector' || !this.ready || !this.map?.getStyle()) return false;
      const map = this.map;
      if (map.getSource('heritage-nearby-venues')) return false;
      map.addSource('heritage-nearby-venues',{
        type:'geojson',data:{type:'FeatureCollection',features:[]},
        cluster:true,clusterMaxZoom:17,clusterRadius:38
      });
      map.addLayer({id:'heritage-venue-clusters',type:'circle',source:'heritage-nearby-venues',
        filter:['has','point_count'],paint:{'circle-color':'#a85b2d','circle-radius':['step',['get','point_count'],16,10,21,30,25],
          'circle-stroke-color':'#fffaf0','circle-stroke-width':2.5,'circle-opacity':.96}});
      map.addLayer({id:'heritage-venue-cluster-count',type:'symbol',source:'heritage-nearby-venues',
        filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-font':['Noto Sans Bold'],'text-size':12},
        paint:{'text-color':'#fffaf0'}});
      map.addLayer({id:'heritage-venue-points',type:'circle',source:'heritage-nearby-venues',
        filter:['!',['has','point_count']],paint:{'circle-color':'#bd7138',
          'circle-radius':['interpolate',['linear'],['zoom'],14,5,18,9],
          'circle-stroke-color':'#fffaf0','circle-stroke-width':2.5,'circle-opacity':.98}});
      map.on('click','heritage-venue-clusters',event=>{
        const feature=event.features?.[0];
        if (!feature) return;
        map.easeTo({center:feature.geometry.coordinates,zoom:Math.min(map.getZoom()+2,19),duration:450});
      });
      map.on('click','heritage-venue-points',event=>{
        const feature=event.features?.[0];
        if (!feature) return;
        const box=this.nearbyVenuePopup(feature.properties || {});
        this.venuePopup?.remove();
        this.venuePopup=new maplibregl.Popup({anchor:'top',offset:14,maxWidth:'280px',className:'heritage-venue-popup-shell'})
          .setLngLat(feature.geometry.coordinates).setDOMContent(box).addTo(map);
      });
      for (const id of ['heritage-venue-clusters','heritage-venue-points']) {
        map.on('mouseenter',id,()=>{map.getCanvas().style.cursor='pointer';});
        map.on('mouseleave',id,()=>{map.getCanvas().style.cursor='';});
      }
      this.container.dataset.nearbyLayer='ready';
      return true;
    }
    nearbyVenuePopup(properties) {
      const box=document.createElement('div');
      box.className='nearby-venue-popup';
      const title=document.createElement('strong');
      title.textContent=properties.name || 'Quán gần di tích';
      const type=document.createElement('span');
      type.textContent=properties.category || 'Quán xá';
      const distance=document.createElement('small');
      distance.textContent=`Gần ${properties.siteName || 'di tích trong tour'} · khoảng ${properties.distanceM || 0} m${properties.extraSites > 0 ? ` · gần thêm ${properties.extraSites} điểm trong tour` : ''}`;
      const note=document.createElement('small');
      note.textContent='Tọa độ tham khảo từ tệp người dùng cung cấp.';
      box.append(title,type,distance,note);
      return box;
    }
    setNearbyVenues(venues) {
      this.visibleNearbyVenues = Array.isArray(venues) ? venues : [];
      this.updateNearbyVenues();
    }
    updateNearbyVenues() {
      const active=this.ready ? this.visibleNearbyVenues : [];
      this.container.dataset.nearbyVenues=String(active.length);
      this.venuePopup?.remove();
      this.venuePopup=null;
      if (!this.ready) return;
      if (this.kind==='raster') {
        this.venueLayer?.clearLayers();
        active.forEach(venue=>{
          const nearest=venue.nearSelected[0];
          const popup=this.nearbyVenuePopup({name:venue.name,category:venue.category,
            siteName:this.byId[nearest.siteId]?.name || nearest.sourcePoi,
            distanceM:nearest.distanceM,extraSites:venue.nearSelected.length-1});
          L.circleMarker([venue.lat,venue.lng],{radius:7,color:'#fffaf0',weight:2.5,
            fillColor:'#bd7138',fillOpacity:.98}).bindPopup(popup).addTo(this.venueLayer);
        });
        return;
      }
      if (this.kind!=='vector') return;
      const features=active.map(venue=>{
        const nearest=venue.nearSelected[0];
        return {type:'Feature',id:venue.id,geometry:{type:'Point',coordinates:[venue.lng,venue.lat]},
          properties:{name:venue.name,category:venue.category,
            siteName:this.byId[nearest.siteId]?.name || nearest.sourcePoi,
            distanceM:nearest.distanceM,extraSites:venue.nearSelected.length-1}};
      });
      this.map.getSource('heritage-nearby-venues')?.setData({type:'FeatureCollection',features});
    }
    setGISData(layers) {
      this.gisData = layers || {};
      if (this.kind === 'vector') this.attachMapLibreGIS();
      else if (this.kind === 'raster') this.attachLeafletGIS();
    }
    modelStatus(state, message) {
      this.modelState = state;
      this.container.dataset.model = state;
      this.onModelStatus?.({state,message});
      if (state === 'error' && this.kind === 'vector') this.status('Mô hình chưa tải được · các lớp bản đồ hiện hành vẫn hoạt động','model-error');
    }
    async loadSketchUp() {
      if (this.modelLayer) return this.modelLayer;
      if (this.modelPromise) return this.modelPromise;
      if (this.kind !== 'vector' || !this.ready) return null;
      if (!window.HeritageSketchUp) {
        this.modelStatus('error','Bộ hiển thị mô hình chưa tải được.');
        return null;
      }
      const generation = this.generation;
      const map = this.map;
      const abort = this.modelAbort = new AbortController();
      this.modelStatus('loading','Đang tải mô hình 3D Văn Miếu…');
      const timeout = this.later(() => abort.abort(),45000);
      const task = (async () => {
        try {
          const layer = await window.HeritageSketchUp.load(abort.signal);
          if (generation !== this.generation || this.kind !== 'vector') { layer.dispose(); return null; }
          this.modelLayer = layer;
          const labels = map.getStyle().layers.find(item => item.type === 'symbol')?.id;
          map.addLayer(layer, labels);
          layer.setVisible(this.sketchupEnabled);
          for (const [name,visible] of Object.entries(this.sketchupLayerVisibility)) layer.setGroupVisible(name,visible);
          this.applyMapLayerVisibility();
          this.modelStatus('ready','Đã tải phần công trình Văn Miếu từ model_2.skp. Vị trí đặt trên bản đồ suy ra từ GIS, chưa được khảo sát; chưa có điểm neo riêng cho từng công trình.');
          return layer;
        } catch (error) {
          if (generation !== this.generation) return null;
          this.modelLayer?.dispose();
          this.modelLayer = null;
          console.warn('Không tải được mô hình 3D Văn Miếu:',error);
          this.sketchupEnabled = false;
          this.onLayerState?.({sketchup:false,osmBuildings:this.osmBuildingsVisible});
          this.applyMapLayerVisibility();
          this.modelStatus('error','Không tải được mô hình 3D Văn Miếu. Bản đồ 2D và các điểm di tích vẫn sử dụng được; thử Tải lại.');
          return null;
        } finally {
          clearTimeout(timeout);
          this.timers.delete(timeout);
        }
      })();
      this.modelPromise = task;
      try { return await task; }
      finally { if (this.modelPromise === task) this.modelPromise = null; }
    }
    focusModel() {
      if (this.kind !== 'vector' || !this.ready || !this.modelLayer) return;
      const config = this.modelLayer.config;
      const [[west,south],[east,north]] = config.campus.focus_bounds_m;
      const origin = maplibregl.MercatorCoordinate.fromLngLat(config.origin,0);
      const unit = origin.meterInMercatorCoordinateUnits();
      const [[a,b],[c,d]] = config.matrix;
      const bounds = new maplibregl.LngLatBounds();
      for (const x of [west,east]) for (const y of [south,north]) {
        const point = new maplibregl.MercatorCoordinate(
          origin.x + unit*(a*x+c*y), origin.y - unit*(b*x+d*y), 0);
        bounds.extend(point.toLngLat());
      }
      const p = this.padding();
      this.map.fitBounds(bounds,{padding:{top:p.top,bottom:p.bottom,left:p.left,right:p.right},
        maxZoom:18.3,duration:650,pitch:55,bearing:-15});
    }
    setGISVisibility(group, visible) {
      if (!this.gisGroups[group]) return;
      this.gisVisibility[group] = Boolean(visible);
      const ids = this.gisGroups[group];
      if (this.kind === 'vector') {
        for (const id of ids) for (const layerId of id === 'water' ? ['gis-water-fill'] : [`gis-${id}`]) {
          if (this.map?.getLayer(layerId)) this.map.setLayoutProperty(layerId,'visibility',visible ? 'visible' : 'none');
        }
      } else if (this.kind === 'raster' && this.map) {
        for (const id of ids) {
          const layer = this.gisLeafletLayers.get(id);
          if (!layer) continue;
          if (visible && !this.map.hasLayer(layer)) layer.addTo(this.map);
          if (!visible && this.map.hasLayer(layer)) this.map.removeLayer(layer);
        }
      }
    }
    applyMapLayerVisibility() {
      if (this.kind !== 'vector' || !this.map?.isStyleLoaded()) return;
      for (const layer of this.map.getStyle().layers) {
        if (layer.id === 'building-3d') continue;
        const isBase = layer.id === 'background' || layer.source === 'openmaptiles' || layer.source === 'ne2_shaded';
        const value = this.baseVisible ? 'visible' : 'none';
        if (isBase && (this.map.getLayoutProperty(layer.id,'visibility') || 'visible') !== value) this.map.setLayoutProperty(layer.id,'visibility',value);
      }
      const osm3d = this.osmBuildingsVisible && !this.sketchupEnabled;
      if (this.map.getLayer('building-3d')) {
        const value = osm3d ? 'visible' : 'none';
        if ((this.map.getLayoutProperty('building-3d','visibility') || 'visible') !== value) this.map.setLayoutProperty('building-3d','visibility',value);
        this.container.dataset.osm3d = this.map.getLayoutProperty('building-3d','visibility') || 'visible';
      } else this.container.dataset.osm3d = 'missing';
      this.modelLayer?.setVisible(this.sketchupEnabled);
      this.container.dataset.buildings = this.sketchupEnabled ? 'sketchup' : osm3d ? 'osm' : 'hidden';
    }
    setMapBaseVisibility(visible) {
      this.baseVisible = Boolean(visible);
      if (this.kind === 'vector' && this.ready) {
        this.applyMapLayerVisibility();
        if (!this.baseVisible) {
          this.baseReady = false;
          this.checkStreets();
        } else {
          this.baseReady = false;
          this.checkStreets();
          this.later(() => { if (this.kind === 'vector' && this.baseVisible && !this.baseReady && !this.hasStreets()) this.fallback('Nguồn bản đồ vector đang gián đoạn'); },8000);
        }
      } else if (this.kind === 'raster' && this.map) {
        if (!this.baseVisible) {
          if (this.tiles && this.map.hasLayer(this.tiles)) this.map.removeLayer(this.tiles);
          this.tiles = null;
          this.baseReady = true;
          this.container.dataset.streets = 'false';
          this.status('Nền OSM tắt · các lớp GIS đang hoạt động','ready');
        } else this.fallback('Đã bật nền OSM');
      }
    }
    setOSMBuildingVisibility(visible) {
      this.osmBuildingsVisible = Boolean(visible);
      if (this.osmBuildingsVisible && this.sketchupEnabled) this.sketchupEnabled = false;
      this.applyMapLayerVisibility();
      this.onLayerState?.({sketchup:this.sketchupEnabled,osmBuildings:this.osmBuildingsVisible});
      this.container.dataset.buildings = this.osmBuildingsVisible ? 'osm' : 'hidden';
    }
    setSketchUpVisibility(visible) {
      this.sketchupEnabled = Boolean(visible);
      if (this.sketchupEnabled && this.kind === 'raster') {
        this.sketchupEnabled = false;
        this.onLayerState?.({sketchup:false,osmBuildings:this.osmBuildingsVisible});
        this.modelStatus('unavailable','Mô hình SketchUp cần bản đồ vector và WebGL; hãy bật lại bằng nút Tải lại.');
        return;
      }
      if (this.sketchupEnabled && this.osmBuildingsVisible) this.osmBuildingsVisible = false;
      this.applyMapLayerVisibility();
      this.onLayerState?.({sketchup:this.sketchupEnabled,osmBuildings:this.osmBuildingsVisible});
      if (this.sketchupEnabled && this.kind === 'vector') this.loadSketchUp();
      if (!this.sketchupEnabled && this.modelState === 'unavailable') this.modelStatus('idle','SketchUp đang tắt. Vị trí suy ra từ GIS, chưa được khảo sát.');
    }
    setMarkersVisibility(visible) {
      this.markersVisible = Boolean(visible);
      for (const {element} of this.markers.values()) element.style.display = this.markersVisible ? '' : 'none';
    }
    setSketchUpLayerVisibility(name, visible) {
      this.sketchupLayerVisibility[name] = Boolean(visible);
      this.modelLayer?.setGroupVisible(name,visible);
    }
    attachMapLibreGIS() {
      const map = this.map;
      if (this.kind !== 'vector' || !this.ready || !map?.isStyleLoaded() || !this.gisData) return;
      const styles = {
        roads: {type:'line',paint:{'line-color':'#857967','line-width':['interpolate',['linear'],['zoom'],12,.45,16,1.2],'line-opacity':.62,'line-blur':.15}},
        water: {type:'fill',paint:{'fill-color':'#7fc6cb','fill-opacity':.32,'fill-outline-color':'#398b94'}},
        railways_area: {type:'line',paint:{'line-color':'#a75e50','line-width':['interpolate',['linear'],['zoom'],12,1.05,16,2.2],'line-opacity':.85,'line-dasharray':[2,1.3]}},
        railways_context: {type:'line',paint:{'line-color':'#a38a67','line-width':1.35,'line-opacity':.7,'line-dasharray':[1,2]}},
        boundary: {type:'line',paint:{'line-color':'#705c83','line-width':2.4,'line-opacity':.86,'line-dasharray':[2,1]}},
        boundary_supplementary: {type:'line',paint:{'line-color':'#bd9452','line-width':1.5,'line-opacity':.82,'line-dasharray':[1,2]}}
      };
      const labels = map.getStyle().layers.find(layer => layer.type === 'symbol')?.id;
      for (const [id, style] of Object.entries(styles)) {
        if (!this.gisData[id] || map.getSource(`gis-${id}`)) continue;
        map.addSource(`gis-${id}`,{type:'geojson',data:this.gisData[id]});
        const group = id === 'railways_area' || id === 'railways_context' ? 'railways' : id === 'boundary' || id === 'boundary_supplementary' ? 'boundaries' : id;
        const visibility = this.gisVisibility[group] ? 'visible' : 'none';
        const layer = {id:`gis-${id}`,source:`gis-${id}`,...style,layout:{visibility}};
        if (id === 'water') {
          map.addLayer({id:`gis-${id}-fill`,source:`gis-${id}`,type:'fill',
            paint:{'fill-color':'#7fc6cb','fill-opacity':.29,'fill-outline-color':'#398b94'},
            layout:{visibility}},labels);
        } else map.addLayer(layer,labels);
      }
    }
    attachLeafletGIS() {
      if (this.kind !== 'raster' || !this.ready || !this.map || !this.gisData) return;
      const styles = {
        roads: {color:'#857967',weight:1.2,opacity:.68},
        water: {color:'#398b94',weight:1,opacity:.75,fillColor:'#7fc6cb',fillOpacity:.3},
        railways_area: {color:'#a75e50',weight:2,dashArray:'5 4',opacity:.9},
        railways_context: {color:'#a38a67',weight:1.5,dashArray:'2 5',opacity:.72},
        boundary: {color:'#705c83',weight:2.5,dashArray:'6 3',opacity:.9,fill:false},
        boundary_supplementary: {color:'#bd9452',weight:1.6,dashArray:'2 5',opacity:.82}
      };
      for (const [id,style] of Object.entries(styles)) {
        if (!this.gisData[id] || this.gisLeafletLayers.has(id)) continue;
        const layer = L.geoJSON(this.gisData[id],{pane:'heritageGIS',style:() => style,interactive:false});
        this.gisLeafletLayers.set(id,layer);
        const group = id === 'railways_area' || id === 'railways_context' ? 'railways' : id === 'boundary' || id === 'boundary_supplementary' ? 'boundaries' : id;
        if (this.gisVisibility[group]) layer.addTo(this.map);
      }
    }
    padding() {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      const mobile = window.matchMedia('(max-width: 1090px)').matches;
      const left = !mobile && this.route && width >= 760 ? 340 : Math.min(width*.12,65);
      return {top:mobile ? 145 : 105,bottom:mobile ? 110 : 155,left,right:Math.min(width*.12,65),height};
    }
    fit(sites, maxZoom = 15.2) {
      if (!this.ready || !sites.length) return;
      const p = this.padding();
      if (this.kind === 'vector') {
        const bounds = new maplibregl.LngLatBounds();
        sites.forEach(s => bounds.extend([s.lng,s.lat]));
        this.map.fitBounds(bounds,{padding:{top:p.top,bottom:p.bottom,left:p.left,right:p.right},
          maxZoom,duration:650,pitch:this.mode === '2.5d' ? 52 : 0,bearing:this.mode === '2.5d' ? -15 : 0});
      } else this.map.fitBounds(sites.map(s => [s.lat,s.lng]),{
        paddingTopLeft:[p.left,p.top],paddingBottomRight:[p.right,p.bottom],maxZoom,animate:false
      });
    }
    overview() { this.fit(this.sites.filter(located),15.2); }
    fitRoute(route) { this.fit(route.sites.map(id => this.byId[id]).filter(located),16.4); }
    fitRoadRoute(segments) { this.fit(segments.flat().map(([lng,lat])=>({lng,lat})),16.4); }
    focus(site) {
      if (!this.ready || !located(site)) return;
      const sheetOpen = window.matchMedia('(max-width:800px)').matches && document.getElementById('details').classList.contains('open');
      const lift = sheetOpen ? Math.min(this.container.clientHeight*.2,160) : 0;
      if (this.kind === 'vector') this.map.flyTo({center:[site.lng,site.lat],zoom:Math.max(this.map.getZoom(),16),offset:[0,-lift],duration:650});
      else {
        this.map.setView([site.lat,site.lng],Math.max(this.map.getZoom(),16),{animate:false});
        if (lift) this.map.panBy([0,lift],{animate:false});
      }
    }
    zoom(amount) { if (this.map) amount > 0 ? this.map.zoomIn() : this.map.zoomOut(); }
    setPerspective(mode, animate = true) {
      this.mode = this.kind === 'raster' ? '2d' : mode;
      if (this.kind !== 'vector' || !this.ready) return;
      const tilted = this.mode === '2.5d';
      this.map.easeTo({pitch:tilted ? 52 : 0,bearing:tilted ? -15 : 0,duration:animate ? 600 : 0});
    }
    resize() { if (this.map) this.kind === 'vector' ? this.map.resize() : this.map.invalidateSize({pan:false}); }
  }
  window.HeritageMap = HeritageMap;
})();
