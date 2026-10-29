import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import HomePage, {Brand} from './HomePage.jsx';
import SitePage from './SitePage.jsx';
import {ILLUSTRATED_SITES} from './illustrated-sites.js';
import landmarkPhotos from './landmark-photos.json';
import nearbyVenues from '../data/nearby-venues.json';
import {venuesForTour} from './nearby-venues.mjs';
import {calculateRoadMetrics} from './route-metrics.mjs';

const ICONS = ['pin','route','walk','bike','search','arrow','external','check','alert','layers','compass','close','copy','filter','book'];
const EMPTY_SITE_IDS = [];
const LAYER_DEFAULTS = {
  base:true, roads:false, water:false, railways:false, buildings:false, sketchup:false, markers:true,
  boundaries:false, noithat:true, nha_khoi:true, timngo:true
};

function Icon({name}) { return <svg className="icon" aria-hidden="true"><use href={`#i-${name}`} /></svg>; }
function IconBank() {
  return <svg className="icon-bank" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <symbol id="i-pin" viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></symbol>
    <symbol id="i-route" viewBox="0 0 24 24"><circle cx="6" cy="18" r="2"/><path d="M9 18h5a5 5 0 0 0 0-10H9a3 3 0 1 1 0-6h8"/><path d="m14 5 3-3 3 3"/></symbol>
    <symbol id="i-walk" viewBox="0 0 24 24"><circle cx="13" cy="3.5" r="1.7"/><path d="m9 21 2-6-2-4-4 3M17 21l-3-7-3-2 1-4 4 2 2 4"/></symbol>
    <symbol id="i-bike" viewBox="0 0 24 24"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="m5.5 17.5 4-9h5l4 9M9.5 8.5l3 9h-7M12 5h4"/></symbol>
    <symbol id="i-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></symbol>
    <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></symbol>
    <symbol id="i-external" viewBox="0 0 24 24"><path d="M13 5h6v6M19 5l-9 9"/><path d="M19 13v6H5V5h6"/></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="m4 12 5 5L20 6"/></symbol>
    <symbol id="i-alert" viewBox="0 0 24 24"><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v.1"/></symbol>
    <symbol id="i-layers" viewBox="0 0 24 24"><path d="m12 2 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 17l9 5 9-5"/></symbol>
    <symbol id="i-compass" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/></symbol>
    <symbol id="i-close" viewBox="0 0 24 24"><path d="M5 5 19 19M19 5 5 19"/></symbol>
    <symbol id="i-copy" viewBox="0 0 24 24"><rect width="13" height="13" x="8" y="8" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></symbol>
    <symbol id="i-filter" viewBox="0 0 24 24"><path d="M3 5h18M7 12h10m-7 7h4"/></symbol>
    <symbol id="i-book" viewBox="0 0 24 24"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1ZM12 5v15"/></symbol>
  </svg>;
}
function normalize(value) { return value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d'); }
function labelOf(site) { return site.name.replace(/\s*\([^)]*\)/g,'').replace('Đình làng','Đình').replace('Đền Mẫu Sòng Sơn – Hà Nội','Đền Sòng Sơn'); }
function kindEmoji(kind) { return ({'chùa':'🛕','đền':'⛩','đình':'🏯','di-tích':'📚','tưởng-niệm':'🕯','hồ':'💧','đình–đền':'🏯'})[kind] || '⌂'; }
function kindColor(kind) { return ({'chùa':'#568a68','đền':'#bb8064','đình':'#46788b','di-tích':'#b28d47','tưởng-niệm':'#866fa6','hồ':'#329aa3','đình–đền':'#658477'})[kind] || '#39785d'; }
function isLocated(site) { return Number.isFinite(site?.lat) && Number.isFinite(site?.lng); }

// Explicitly reconcile the few names that differ between the two views.
const PHOTO_NAME_EQUIVALENTS = {
  ho_van:['Hồ Văn – Gò Kim Châu','Hồ Văn'],
  kim_lien:['Đền Kim Liên (Đình Kim Liên)','Đền Kim Liên'],
  kham_duc_den:['Đền Khâm Đức (thờ Châu Đệ Tứ)','Đền Khâm Đức – thờ Châu Đệ Tứ']
};
function photoForSite(site) {
  const illustrated=ILLUSTRATED_SITES.find(item=>item.id===site.id);
  const names=PHOTO_NAME_EQUIVALENTS[site.id];
  const sameName=illustrated && (illustrated.name===site.name || (names && names[0]===site.name && names[1]===illustrated.name));
  return sameName ? landmarkPhotos[site.id] : null;
}

function DetailCover({site,index,located}) {
  const [failed,setFailed]=useState(false);
  const photo=photoForSite(site);
  const showPhoto=Boolean(photo && !failed);
  return <div className={`detail-cover${located?'':' cover-unlocated'}${showPhoto?' has-photo':''}`}>
    {showPhoto ? <img className="detail-cover-photo" data-site-photo={site.id} src={photo.src} alt={`Ảnh ${site.name}`} onError={()=>setFailed(true)}/> : <span className="cover-architecture" aria-hidden="true">{kindEmoji(site.kind)}</span>}
    <span className="cover-floating">DI SẢN VĂN HÓA HÀ NỘI</span><span className="cover-category-tag">{site.kind.toUpperCase()}</span><span className="cover-num">{String(index).padStart(2,'0')}</span>
  </div>;
}

const roadMetricCache = new Map();
const formatKm = value=>`${new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(value)} km`;
function formatTravelTime(seconds) {
  const minutes=Math.max(1,Math.round(seconds/60));
  const hours=Math.floor(minutes/60),rest=minutes%60;
  return hours ? `${hours} giờ${rest?` ${rest} phút`:''}` : `${minutes} phút`;
}
function RouteMetrics({route,byId,onResult}) {
  const key=`${route.mode}:${route.sites.join(',')}`;
  const stops=route.sites.map(id=>byId[id]);
  const missing=stops.filter(site=>!isLocated(site));
  const [state,setState]=useState({key,status:'idle'});
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(stops.length<2 || missing.length) return undefined;
    const cached=roadMetricCache.get(key);
    if(cached) {setState({key,status:'ready',value:cached});onResult(key,cached);return undefined;}
    const abort=new AbortController();
    let expired=false;
    setState({key,status:'loading'});
    const timeout=setTimeout(()=>{expired=true;abort.abort();},20000);
    const debounce=setTimeout(async()=>{
      try {
        const value=await calculateRoadMetrics(stops,route.mode,{signal:abort.signal,fetchImpl:window.fetch?.bind(window)});
        if(abort.signal.aborted) return;
        roadMetricCache.set(key,value);
        setState({key,status:'ready',value});
        onResult(key,value);
      } catch(error) {
        if(abort.signal.aborted && !expired) return;
        setState({key,status:'error'});
      } finally {clearTimeout(timeout);}
    },300);
    return ()=>{clearTimeout(debounce);clearTimeout(timeout);abort.abort();};
  },[key,attempt]);
  if(stops.length<2) return <p className="route-metrics-message">Chọn ít nhất hai điểm để tính quãng đường.</p>;
  if(missing.length) return <p className="route-metrics-message">Chưa thể vẽ và tính toàn tuyến: {missing.map(site=>site?.name || 'địa điểm chưa xác định').join(', ')} chưa có tọa độ.</p>;
  const status=state.key===key?state.status:'loading';
  if(status==='error') return <div className="route-metrics-message" role="status">Chưa tải được đường đi và quãng đường. <button type="button" className="route-metrics-retry" onClick={()=>setAttempt(value=>value+1)}>Thử lại</button></div>;
  if(status!=='ready') return <p className="route-metrics-message" role="status">Đang tìm đường và tính thời gian…</p>;
  return <div className="route-metrics" aria-live="polite">
    <div className="route-metrics-heading">ƯỚC TÍNH THEO ĐƯỜNG · {route.mode==='walk'?'ĐI BỘ':'XE MÁY'}</div>
    <div className="route-metrics-total"><strong>{formatKm(state.value.km)}</strong><span>·</span><strong>{formatTravelTime(state.value.seconds)}</strong></div>
    <ol className="route-metrics-legs">{state.value.legs.map((leg,index)=><li key={index}><span>{index+1} → {index+2}</span><span>{formatKm(leg.km)} · {formatTravelTime(leg.seconds)}</span></li>)}</ol>
    <details className="route-directions"><summary>Hướng dẫn từng chặng</summary>{state.value.legs.map((leg,index)=><section key={index}><strong>{index+1} → {index+2}</strong>{leg.instructions.length ? <ol>{leg.instructions.map((instruction,i)=><li key={i}>{instruction}</li>)}</ol> : <p>Chưa có hướng dẫn chi tiết.</p>}</section>)}</details>
    <p>Ước tính từ OpenStreetMap theo tọa độ tâm; chưa xác minh cổng, giao thông hoặc lối đi thực tế. Không tính thời gian tham quan.</p>
  </div>;
}

function LayerToggle({id, attribute, value, checked, disabled, label, swatch, onChange}) {
  return <label><input id={id} type="checkbox" {...{[attribute]:value}} checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)} /><span className={`gis-swatch ${swatch}`} />{label}</label>;
}

function MapPage() {
  const data = window.HERITAGE_DATA;
  const sites = data?.sites || [];
  const routes = data?.routes || [];
  const byId = Object.fromEntries(sites.map(site=>[site.id,site]));
  const [category,setCategory] = useState('all');
  const [routeId,setRouteId] = useState(null);
  const [selected,setSelected] = useState('van_mieu');
  const [search,setSearch] = useState('');
  const [panel,setPanel] = useState('explore');
  const [tourSearch,setTourSearch] = useState('');
  const [tourStops,setTourStops] = useState([]);
  const [tourMode,setTourMode] = useState('walk');
  const [tourPreview,setTourPreview] = useState(false);
  const [viewMode,setViewMode] = useState('2d');
  const [layers,setLayers] = useState(LAYER_DEFAULTS);
  const [mapStatus,setMapStatus] = useState({message:'Đang khởi tạo bản đồ…',level:'loading',renderer:'loading'});
  const [modelStatus,setModelStatus] = useState('Mô hình Văn Miếu tải khi chọn chế độ 3D. Vị trí trên bản đồ suy ra từ GIS, chưa được khảo sát.');
  const [modelPhase,setModelPhase] = useState('idle');
  const [gisStatus,setGisStatus] = useState('Đang nạp lớp GIS…');
  const [menuOpen,setMenuOpen] = useState(false);
  const [detailsOpen,setDetailsOpen] = useState(false);
  const [sidebarCollapsed,setSidebarCollapsed] = useState(false);
  const [detailsCollapsed,setDetailsCollapsed] = useState(false);
  const [roadResult,setRoadResult] = useState(null);
  const mapRef = useRef(null);
  const selectSiteRef = useRef(null);
  const focusAfterModelRef = useRef(false);
  const tourStopsRef = useRef(tourStops);
  tourStopsRef.current = tourStops;
  const selectedRoute = tourPreview && tourStops.length ? {id:'CUSTOM',title:'Tour của bạn',mode:tourMode,color:'#267459',sites:tourStops} : routes.find(route=>route.id===routeId) || null;
  const tourPhotoStops=useMemo(()=>viewMode==='3d' && (panel==='tour' || tourPreview)
    ? tourStops.map((id,index)=>({id,order:index+1,src:photoForSite(byId[id])?.src || null}))
    : [],[viewMode,panel,tourPreview,tourStops]);
  const tourNearbyVenues=useMemo(()=>venuesForTour(nearbyVenues,tourStops),[tourStops]);
  const nearbySiteIds=panel==='tour' && !tourPreview ? tourStops : selectedRoute?.sites || EMPTY_SITE_IDS;
  const activeNearbyVenues=useMemo(()=>venuesForTour(nearbyVenues,nearbySiteIds),[nearbySiteIds]);
  const selectedRouteKey=selectedRoute?`${selectedRoute.mode}:${selectedRoute.sites.join(',')}`:null;
  const byRoute = selectedRoute ? {...selectedRoute,roadSegments:roadResult?.key===selectedRouteKey?roadResult.value.legs.map(leg=>leg.coordinates):null} : null;
  const selectedSite = byId[selected];
  const locatedCount = sites.filter(isLocated).length;
  const modelReady = document.getElementById('map')?.dataset.model === 'ready';
  const raster = mapStatus.renderer === 'raster';

  function membership(site) { return routes.filter(route=>route.sites.includes(site.id)); }
  function overview() { mapRef.current?.overview(); }
  function closeMobileMenu() { setMenuOpen(false); }
  function focusPending3d() {
    const engine=mapRef.current;
    if(!focusAfterModelRef.current || engine?.kind!=='vector' || !engine.ready) return;
    const stops=tourStopsRef.current;
    if(stops.length===1) engine.fit([byId[stops[0]]].filter(isLocated),18.2);
    else if(stops.length) engine.fitRoute({sites:stops});
    else if(engine.modelState==='ready') engine.focusModel();
    else return;
    focusAfterModelRef.current=false;
  }
  function switchMapView(mode) {
    const engine=mapRef.current;
    if(mode==='3d' && raster) return;
    const showModel=mode==='3d';
    focusAfterModelRef.current=showModel;
    setViewMode(mode);
    setLayers(current=>({...current,sketchup:showModel,buildings:showModel?false:current.buildings}));
    if(!engine) return;
    engine.mode=showModel?'2.5d':'2d';
    engine.setSketchUpVisibility(showModel);
    if(showModel) {
      if(!tourStops.length) setSelected('van_mieu');
      focusPending3d();
    } else engine.overview();
  }
  function setRoute(id) {
    const requested = routes.find(route=>route.id===id);
    if (!requested) return;
    const next = routeId === id ? null : id;
    setTourPreview(false);
    if(viewMode==='3d') switchMapView('2d');
    setRouteId(next);
    if (next) { setCategory(requested.mode); setSelected(requested.sites[1] || requested.sites[0]); mapRef.current?.fitRoute(requested); }
    else { setCategory('all'); overview(); }
    closeMobileMenu();
  }
  function addTourStop(id) {
    if (!byId[id]) return;
    setTourStops(current=>current.includes(id)?current:[...current,id]);
    setPanel('tour');
    mapRef.current?.fit([byId[id]].filter(isLocated),viewMode==='3d'?18.2:17.2);
  }
  function moveTourStop(index,step) {
    setTourStops(current=>{
      const next=index+step;
      if(next<0||next>=current.length) return current;
      const copy=[...current]; [copy[index],copy[next]]=[copy[next],copy[index]]; return copy;
    });
  }
  function previewTour() {
    if(!tourStops.length) return;
    setRouteId(null); setTourPreview(true);
    const route={id:'CUSTOM',title:'Tour của bạn',mode:tourMode,color:'#267459',sites:tourStops};
    mapRef.current?.render(route,selected);
    mapRef.current?.fitRoute(route);
    closeMobileMenu();
  }
  function selectSite(id) {
    const site = byId[id];
    if (!site) return;
    if(viewMode==='3d' && id!=='van_mieu' && !tourStops.includes(id)) switchMapView('2d');
    setSelected(id); setDetailsOpen(true); setDetailsCollapsed(false); closeMobileMenu();
    const panel = document.getElementById('details');
    if (panel) panel.scrollTop = 0;
    mapRef.current?.focus(site);
  }
  selectSiteRef.current = selectSite;

  function changeLayer(key,value,engineMethod,argument=key) {
    setLayers(current=>({...current,[key]:value}));
    const engine = mapRef.current;
    if (engineMethod === 'gis') engine?.setGISVisibility(argument,value);
    else if (engineMethod === 'sketchup-sub') engine?.setSketchUpLayerVisibility(argument,value);
    else engine?.[engineMethod]?.(value);
  }

  useLayoutEffect(()=>{
    if (!window.HeritageMap || !sites.length) return undefined;
    const makeMarker = site => {
      const element = document.createElement('div');
      element.className = 'map-marker'; element.dataset.siteId = site.id; element.dataset.color = kindColor(site.kind);
      element.style.setProperty('--marker',kindColor(site.kind)); element.title = `${site.name} — vị trí tham khảo`;
      element.setAttribute('role','button'); element.setAttribute('tabindex','0'); element.setAttribute('aria-label',`Xem chi tiết ${site.name}`);
      element.innerHTML = `<div class="map-marker-label">${labelOf(site)}</div><div class="map-marker-core"><span class="marker-photo-frame" aria-hidden="true"></span><span class="marker-kind">${kindEmoji(site.kind)}</span><span class="marker-number"></span></div>`;
      const choose = () => selectSiteRef.current?.(site.id);
      element.addEventListener('click',choose);
      element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}});
      return element;
    };
    const engine = new window.HeritageMap({
      sites,makeMarker,
      onModelStatus:({message,state:modelState})=>{
        setModelStatus(message);
        setModelPhase(modelState);
        if (modelState==='ready') focusPending3d();
        if (modelState==='error') { focusAfterModelRef.current=false; setViewMode('2d'); engine.mode='2d'; engine.overview(); }
      },
      onReady:focusPending3d,
      onLayerState:({sketchup,osmBuildings})=>setLayers(current=>({...current,
        ...(sketchup==null?{}:{sketchup}),...(osmBuildings==null?{}:{buildings:osmBuildings})})),
      onStatus:status=>{setMapStatus(status);if(status.renderer==='raster')setViewMode('2d');}
    });
    mapRef.current = engine;
    engine.start();
    engine.render(null,'van_mieu');
    const observer = window.ResizeObserver ? new ResizeObserver(()=>engine.resize()) : null;
    observer?.observe(document.getElementById('map'));
    let live = true;
    if (window.HeritageGIS) {
      window.HeritageGIS.load().then(({manifest,layers:gisLayers})=>{
        if (!live) return;
        engine.setGISData(gisLayers);
        const count = Object.values(gisLayers).reduce((total,layer)=>total+layer.features.length,0);
        setGisStatus(`${Object.keys(gisLayers).length} lớp GIS · ${count.toLocaleString('vi-VN')} đối tượng; lớp điểm kiểm toán không hiển thị.`);
        const map = document.getElementById('map');
        map.dataset.gisReady = 'true'; map.dataset.gisStatus = manifest?.status || 'bundled';
      }).catch(error=>{
        console.warn('Không nạp được lớp GIS cục bộ:',error);
        if (!live) return;
        setGisStatus('Lớp GIS cục bộ chưa tải được; bản đồ nền và danh mục vẫn hoạt động.');
        document.getElementById('map').dataset.gisReady = 'false';
      });
    }
    return ()=>{
      live = false; observer?.disconnect(); engine.clear();
      if (mapRef.current===engine) mapRef.current=null;
    };
  },[]);

  useEffect(()=>{
    mapRef.current?.render(byRoute,selected);
  },[routeId,selected,tourPreview,tourStops,tourMode,roadResult]);

  useEffect(()=>{
    mapRef.current?.setTourPhotoMarkers?.(tourPhotoStops);
  },[tourPhotoStops]);

  useEffect(()=>{
    mapRef.current?.setNearbyVenues?.(activeNearbyVenues);
  },[activeNearbyVenues]);

  useEffect(()=>{
    if(selectedRouteKey && roadResult?.key===selectedRouteKey) mapRef.current?.fitRoadRoute(roadResult.value.legs.map(leg=>leg.coordinates));
  },[roadResult,selectedRouteKey]);

  useEffect(()=>{
    const onKey = event=>{if(event.key==='Escape'){setMenuOpen(false);setDetailsOpen(false);}};
    document.addEventListener('keydown',onKey);
    return ()=>document.removeEventListener('keydown',onKey);
  },[]);

  if (!data) return <p role="alert">Không tìm thấy dữ liệu. Hãy giữ data.js cạnh index.html.</p>;

  const visibleRoutes = routes.filter(route=>category==='all'||route.mode===category);
  const term = normalize(search.trim());
  const orderedSites = [...sites];
  if (byRoute) orderedSites.sort((a,b)=>{
    const ai=byRoute.sites.indexOf(a.id),bi=byRoute.sites.indexOf(b.id);
    return (ai<0?999:ai)-(bi<0?999:bi);
  });
  const visibleSites = orderedSites.filter(site=>!term||normalize([site.name,...site.aliases,site.kind].join(' ')).includes(term));
  const tourTerm=normalize(tourSearch.trim());
  const tourResults=sites.filter(site=>!tourTerm||normalize([site.name,...(site.aliases||[]),site.address||''].join(' ')).includes(tourTerm));
  const selectedIndex = selectedSite ? sites.indexOf(selectedSite)+1 : 0;
  const selectedLocated = isLocated(selectedSite);
  const selectedMembership = selectedSite ? membership(selectedSite) : [];
  const activeModelCaption = raster ? 'NỀN 2D DỰ PHÒNG' : viewMode==='3d' ? '3D VĂN MIẾU · VỊ TRÍ SUY RA TỪ GIS' : '2D TOÀN KHU · BẢN ĐỒ OSM';
  const visibleMapStatus = (viewMode==='3d' ? modelPhase==='ready' ? '3D Văn Miếu · vị trí suy ra từ GIS' : modelPhase==='loading' ? 'Đang tải mô hình 3D Văn Miếu…' : 'Đang chuẩn bị mô hình 3D Văn Miếu…' : mapStatus.renderer==='vector' && mapStatus.level==='ready' ? 'Bản đồ đường phố 2D · OpenStreetMap' : mapStatus.message)
    + (nearbySiteIds.length ? ` · ${activeNearbyVenues.length} quán quanh ${panel==='tour' && !tourPreview ? 'tour đang tạo' : 'tuyến'}` : '');
  const modelDescription = 'Bản 3D chỉ tải các nhóm công trình bên trong Văn Miếu từ model_2.skp. File nguồn chưa gắn tên và điểm neo cho từng công trình; vị trí đặt trên bản đồ suy ra từ GIS, chưa khảo sát.';
  const updateCategory = next=>{
    setCategory(next);
    if (byRoute && next!=='all' && byRoute.mode!==next) setRouteId(null);
    if (!byRoute || (next!=='all'&&byRoute.mode!==next)) overview();
  };
  const resetRoute = ()=>{setRouteId(null);setTourPreview(false);setCategory('all');if(viewMode==='3d')switchMapView('2d');else overview();};
  const retryMap = ()=>{
    const engine=mapRef.current;
    if(!engine)return;
    engine.mode=viewMode==='3d'?'2.5d':'2d';engine.baseReady=false;engine.start();
  };
  return <>
    <IconBank />
    <header className="topbar">
      <Brand />
      <div className="topbar-center"><span className="status-dot" /> Hành trình qua những lớp ký ức Thăng Long</div>
      <div className="topbar-right"><button className="menu-toggle" id="menu-toggle" aria-label="Mở tuyến và tìm di tích" aria-expanded={menuOpen} aria-controls="sidebar" onClick={()=>setMenuOpen(value=>!value)}><Icon name="filter" /><span>Tuyến & địa điểm</span></button></div>
    </header>

    <main className={`app-shell${sidebarCollapsed?' sidebar-collapsed':''}${detailsCollapsed?' details-collapsed':''}`}>
      <aside className={`sidebar${menuOpen?' open':''}`} id="sidebar">
        <button type="button" id="sidebar-close" className="panel-close" aria-label="Đóng danh sách tuyến" onClick={closeMobileMenu}>×</button>
        <div className="sidebar-scroll">
          <nav className="planner-nav" aria-label="Chế độ khám phá"><button type="button" aria-pressed={panel==='explore'} onClick={()=>setPanel('explore')}>Khám phá</button><button type="button" id="open-tour-planner" aria-pressed={panel==='tour'} onClick={()=>setPanel('tour')}>Tạo tour của bạn</button></nav>
          {panel==='tour' ? <section className="tour-planner" aria-label="Thiết kế tour">
            <div className="eyebrow"><span className="eyebrow-line"/> HÀNH TRÌNH CỦA BẠN</div>
            <h1>Chọn điểm ghé,<br/><em>tạo hành trình.</em></h1>
            <p className="planner-intro">Tìm theo tên di tích hoặc tên đường trong địa chỉ, rồi thêm các điểm theo thứ tự bạn muốn ghé.</p>
            <div className="planner-mode" role="group" aria-label="Phương tiện"><button type="button" aria-pressed={tourMode==='walk'} onClick={()=>setTourMode('walk')}>Đi bộ</button><button type="button" aria-pressed={tourMode==='motorbike'} onClick={()=>setTourMode('motorbike')}>Xe máy</button></div>
            <div className="planner-heading"><h2>Điểm đã chọn</h2><span>{tourStops.length} điểm</span></div>
            {tourStops.length ? <ol className="planner-stops">{tourStops.map((id,index)=>{const site=byId[id];return <li key={id}>
              <span className="planner-number">{index+1}</span><div className="planner-stop-text"><strong>{site.name}</strong><span>{site.address||'Chưa có địa chỉ'}</span>{!isLocated(site)&&<small>Chưa có tọa độ để đặt trên bản đồ</small>}</div>
              <div className="planner-stop-actions"><button type="button" aria-label={`Đưa ${site.name} lên`} disabled={index===0} onClick={()=>moveTourStop(index,-1)}>↑</button><button type="button" aria-label={`Đưa ${site.name} xuống`} disabled={index===tourStops.length-1} onClick={()=>moveTourStop(index,1)}>↓</button><button type="button" aria-label={`Bỏ ${site.name}`} onClick={()=>{setTourStops(current=>current.filter(stop=>stop!==id));if(tourStops.length===1)setTourPreview(false);}}>×</button></div>
            </li>})}</ol> : <p className="planner-empty">Chưa có điểm ghé. Chọn địa điểm ở danh sách bên dưới.</p>}
            {tourStops.length>0&&<p className="planner-venue-note">{tourNearbyVenues.length} quán xá quanh các điểm đã chọn · hiện bằng các chấm trên bản đồ 2D và 3D. Chạm vào chấm để xem tên.</p>}
            <button type="button" id="preview-tour" className="planner-preview" disabled={!tourStops.length} onClick={previewTour}>Xem hành trình trên bản đồ</button>
            <p className="planner-note">Đường đi được ước tính theo OpenStreetMap từ tọa độ tâm; cổng vào và lối đi thực tế chưa được xác minh.</p>
            <div className="planner-heading planner-search-heading"><h2>Thêm địa điểm</h2><span>{tourResults.length}/{sites.length} điểm</span></div>
            <label className="search-field"><Icon name="search"/><input id="tour-search" type="search" placeholder="Tìm địa điểm hoặc tên đường..." value={tourSearch} onChange={event=>setTourSearch(event.target.value)}/></label>
            <div className="planner-results" aria-live="polite">{tourResults.length ? tourResults.map(site=><div className="planner-result" key={site.id}><div><strong>{site.name}</strong><span>{site.address||'Chưa có địa chỉ'}</span>{!isLocated(site)&&<small>Chưa có tọa độ</small>}</div><button type="button" aria-label={`Thêm ${site.name} vào tour`} disabled={tourStops.includes(site.id)} onClick={()=>addTourStop(site.id)}>{tourStops.includes(site.id)?'Đã thêm':'+ Thêm'}</button></div>) : <p className="planner-empty">Không tìm thấy địa điểm phù hợp.</p>}</div>
            <p className="planner-note">Danh mục hiện có {sites.length} địa điểm; chưa đủ dữ liệu để xác định đầy đủ 37 di tích.</p>
          </section> : <>
          <div className="eyebrow"><span className="eyebrow-line" /> KHÁM PHÁ HÀ NỘI</div>
          <h1>Di sản trong<br/><em>từng bước chân.</em></h1>
          <p className="hero-subtitle">Bản đồ 2D toàn khu, mô hình 3D Văn Miếu và 6 hành trình của tài liệu gốc.</p>
          <div className="metrics"><div className="metric"><b id="metric-geocoded">{locatedCount}</b><span>điểm có tọa độ</span></div><div className="metric-divider"/><div className="metric"><b>06</b><span>hành trình</span></div><div className="metric-divider"/><div className="metric"><b>37</b><span>mục tiêu</span></div></div>
          <div className="section-row route-heading"><div><div className="kicker">BƯỚC 01</div><h2>Chọn tuyến tham quan</h2></div><span className="mini-count">06 tuyến</span></div>
          <div className="tabs" role="tablist" aria-label="Lọc loại tuyến">
            {[['all','Tất cả'],['walk',<><Icon name="walk"/> Đi bộ</>],['motorbike',<><Icon name="bike"/> Xe máy</>]].map(([value,label])=><button key={value} id={`tab-${value}`} className={`tab${category===value?' active':''}`} data-category={value} role="tab" aria-selected={category===value} onClick={()=>updateCategory(value)}>{label}</button>)}
          </div>
          <div className="route-list" id="route-list" aria-live="polite">
            {visibleRoutes.map(route=>{
              const missing=route.sites.filter(id=>!isLocated(byId[id])); const active=routeId===route.id;
              return <button key={route.id} type="button" className={`route-card${active?' active':''}`} data-route={route.id} style={{'--route-color':route.color}} aria-pressed={active} onClick={()=>setRoute(route.id)}>
                <div className="route-card-top"><span className="route-icon"><Icon name={route.mode==='walk'?'walk':'bike'}/></span><span className="route-text"><span className="route-code">{route.id} · {route.mode==='walk'?'ĐI BỘ':'XE MÁY'}</span><span className="route-title">{route.title}</span><span className="route-end">{route.sites.length} điểm ghé <i className="small-dot"/> {missing.length?`${missing.length} chờ định vị`:'đủ tọa độ'}</span></span><Icon name="arrow"/></div>
              </button>;
            })}
            {routeId&&<button type="button" className="route-clear" data-reset-route="1" onClick={resetRoute}><Icon name="close"/> Bỏ chọn tuyến · Hiện tất cả điểm</button>}
          </div>
          <div className="section-row site-heading"><div><div className="kicker">BƯỚC 02</div><h2>Khám phá địa điểm</h2></div><span className="mini-count" id="site-count">{visibleSites.length}/{sites.length} điểm</span></div>
          <label className="search-field"><Icon name="search"/><input id="site-search" type="search" placeholder="Tìm tên di tích..." autoComplete="off" value={search} onChange={event=>setSearch(event.target.value)}/><span className="search-key">⌕</span></label>
          <div className="site-list" id="site-list" aria-live="polite">
            {visibleSites.length ? visibleSites.map(site=>{
              const index=byRoute&&byRoute.sites.includes(site.id)?byRoute.sites.indexOf(site.id)+1:sites.indexOf(site)+1;
              const located=isLocated(site),onRoute=byRoute&&byRoute.sites.includes(site.id),dim=byRoute&&!onRoute&&selected!==site.id;
              const sub=located?`${site.coord_status==='gazette_centroid'?'Tọa độ theo TT 10/2022':site.coord_status==='osm_reference'?'Vị trí tham khảo OpenStreetMap':'Vị trí tham khảo GIS'} ${onRoute?'· Thuộc tuyến':''}`:'Chưa xác minh vị trí';
              return <button key={site.id} type="button" className={`site-row${selected===site.id?' selected':''}${dim?' dim':''}`} data-site={site.id} aria-current={selected===site.id} onClick={()=>selectSite(site.id)}>
                <span className="site-index">{String(index).padStart(2,'0')}</span><span className="site-row-text"><span className="site-row-name">{site.name}</span><span className="site-row-sub">{sub}</span></span><span className={`site-status-dot${located?'':' missing'}`}/>
              </button>;
            }):<div className="empty-list">Không tìm thấy di tích phù hợp.</div>}
          </div>
          </>}
        </div>
      </aside>

      <section className="map-wrap" aria-label="Bản đồ địa điểm di sản">
        <div id="map" role="application" aria-label="Bản đồ OpenStreetMap tương tác và vị trí tham khảo các điểm di tích" />
        <button type="button" className="panel-edge-toggle panel-edge-left" aria-controls="sidebar" aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed?'Mở bảng tuyến và địa điểm':'Thu gọn bảng tuyến và địa điểm'} title={sidebarCollapsed?'Mở bảng tuyến và địa điểm':'Thu gọn bảng tuyến và địa điểm'} onClick={()=>setSidebarCollapsed(value=>!value)}>{sidebarCollapsed?'›':'‹'}</button>
        <button type="button" className="panel-edge-toggle panel-edge-right" aria-controls="details" aria-expanded={!detailsCollapsed} aria-label={detailsCollapsed?'Mở bảng chi tiết':'Thu gọn bảng chi tiết'} title={detailsCollapsed?'Mở bảng chi tiết':'Thu gọn bảng chi tiết'} onClick={()=>setDetailsCollapsed(value=>!value)}>{detailsCollapsed?'‹':'›'}</button>
        <div id="map-failure" className="map-failure" hidden={!['error'].includes(mapStatus.level)} role="alert"><strong>Chưa tải được nền đường phố.</strong><span>Danh sách và chi tiết vẫn dùng được. Nhấn Tải lại khi có mạng.</span></div>
        <div className="map-caption"><span className="tiny-dot"/> HÀ NỘI · VĂN MIẾU – KHÂM THIÊN <span className="cap-separator">/</span><span id="view-caption">{activeModelCaption}</span></div>
        <div className="map-status" id="map-status" data-level={viewMode==='3d' && modelPhase==='loading'?'loading':mapStatus.level} role="status" aria-live="polite"><span id="map-status-text">{visibleMapStatus}</span><button type="button" id="map-retry" onClick={retryMap}>Tải lại</button><button type="button" id="map-raster" title="Dùng bản đồ đường phố 2D không cần WebGL" onClick={()=>mapRef.current?.fallback('Đã chọn nền 2D')}>Nền 2D</button></div>
        <div className="map-control-group">
          <div className="map-mode-switch" role="group" aria-label="Chế độ xem bản đồ">
            <button id="map-mode-2d" type="button" className="map-control" aria-pressed={viewMode==='2d'} onClick={()=>switchMapView('2d')}>2D toàn khu</button>
            <button id="map-mode-3d" type="button" className="map-control" title={raster?'3D cần WebGL; nhấn Tải lại để thử bản đồ vector':'Xem mô hình công trình trong Văn Miếu'} aria-pressed={viewMode==='3d'} disabled={raster} onClick={()=>switchMapView('3d')}>3D Văn Miếu</button>
          </div>
          <button id="map-reset" className="map-control icon-only" title="Về bản đồ toàn khu" onClick={()=>switchMapView('2d')}><Icon name="compass"/></button>
          <button id="map-zoom-in" className="map-control square-control" title="Phóng to" onClick={()=>mapRef.current?.zoom(1)}>+</button>
          <button id="map-zoom-out" className="map-control square-control" title="Thu nhỏ" onClick={()=>mapRef.current?.zoom(-1)}>−</button>
        </div>
        <div id="floating-route" className="floating-route" style={{'--active-route':byRoute?.color || '#267459'}} hidden={!byRoute}>
          {byRoute&&<><div className="floating-route-label">{byRoute.id==='CUSTOM'?'TOUR CỦA BẠN':byRoute.id} · {byRoute.mode==='walk'?'ĐI BỘ':'XE MÁY'} · {byRoute.sites.length} ĐIỂM</div>
            <details className="route-itinerary" open={byRoute.id==='CUSTOM'?true:undefined}><summary>{byRoute.title} <span>Xem điểm ghé</span></summary><ol className="route-stops">{byRoute.sites.map((id,index)=>{
              const site=byId[id],located=isLocated(site);
              return <li key={id}><button type="button" data-site={id} className={located?'':'unlocated-stop'} onClick={()=>selectSite(id)}><b>{index+1}</b><span>{labelOf(site)}{byRoute.id==='CUSTOM'&&<small>{site.address||'Chưa có địa chỉ'}</small>}{!located&&<small>Chưa có tọa độ · chỉ xem chi tiết</small>}</span></button></li>;
            })}</ol></details>
            {byRoute.sites.some(id=>!isLocated(byId[id]))&&<p className="route-missing">{byRoute.sites.filter(id=>!isLocated(byId[id])).length} điểm chưa có tọa độ để đặt pin.</p>}
            <RouteMetrics route={byRoute} byId={byId} onResult={(key,value)=>setRoadResult({key,value})}/>
            <button type="button" className="route-clear" data-reset-route="1" onClick={resetRoute}><Icon name="close"/> Bỏ chọn tuyến</button>
          </>}
        </div>
        <details className="map-key" id="map-key"><summary className="map-key-title">CHÚ GIẢI & KIỂM SOÁT LỚP</summary>
          <div className="map-key-entry"><span className="key-pin official"/> {sites.filter(site=>site.coord_status==='gazette_centroid').length} tâm địa danh · Thông tư 10/2022</div><div className="map-key-entry"><span className="key-pin official"/> {sites.filter(site=>site.coord_status==='osm_reference').length} vị trí tham khảo · OpenStreetMap</div><div className="map-key-entry"><span className="key-pin official"/> {sites.filter(site=>site.coord_status==='gis_reference').length} vị trí tham khảo · GIS dự án</div>{sites.some(site=>!isLocated(site))&&<div className="map-key-entry"><span className="key-pin missing"/> {sites.filter(site=>!isLocated(site)).length} điểm chờ định vị · xem danh sách</div>}<div className="map-key-entry"><span className="key-road-route"/> Tuyến đường ước tính từ OpenStreetMap</div><div className="map-key-entry"><span className="key-venue"/> Quán xá quanh tuyến hoặc tour đang chọn</div>
          <fieldset className="gis-layer-controls"><legend>Các lớp hiển thị</legend>
            <LayerToggle id="layer-osm-base" attribute="data-map-base" value="" checked={layers.base} label="Bản đồ nền OSM" swatch="gis-road" onChange={value=>changeLayer('base',value,'setMapBaseVisibility')}/>
            <LayerToggle id="layer-gis-roads" attribute="data-gis-group" value="roads" checked={layers.roads} label="Đường GIS" swatch="gis-road" onChange={value=>changeLayer('roads',value,'gis','roads')}/>
            <LayerToggle id="layer-gis-water" attribute="data-gis-group" value="water" checked={layers.water} label="Nước GIS" swatch="gis-water" onChange={value=>changeLayer('water',value,'gis','water')}/>
            <LayerToggle id="layer-gis-railways" attribute="data-gis-group" value="railways" checked={layers.railways} label="Đường sắt GIS" swatch="gis-rail" onChange={value=>changeLayer('railways',value,'gis','railways')}/>
            <LayerToggle id="layer-osm-buildings" attribute="data-map-buildings" value="" checked={layers.buildings} label="Nhà 3D OSM" swatch="gis-context" disabled={viewMode==='3d'} onChange={value=>changeLayer('buildings',value,'setOSMBuildingVisibility')}/>
            <LayerToggle id="layer-markers" attribute="data-map-markers" value="" checked={layers.markers} label="Marker di tích" swatch="" onChange={value=>changeLayer('markers',value,'setMarkersVisibility')}/>
            <LayerToggle id="layer-sketchup-details" attribute="data-sketchup-layer" value="noithat" checked={layers.noithat} label="Kiến trúc Văn Miếu" swatch="gis-context" disabled={raster||!modelReady} onChange={value=>changeLayer('noithat',value,'sketchup-sub','noithat')}/>
            <LayerToggle id="layer-sketchup-blocks" attribute="data-sketchup-layer" value="nha_khoi" checked={layers.nha_khoi} label="Khối công trình" swatch="gis-context" disabled={raster||!modelReady} onChange={value=>changeLayer('nha_khoi',value,'sketchup-sub','nha_khoi')}/>
            <LayerToggle id="layer-sketchup-annotations" attribute="data-sketchup-layer" value="timngo" checked={layers.timngo} label="Chi tiết phụ trợ" swatch="gis-context" disabled={raster||!modelReady} onChange={value=>changeLayer('timngo',value,'sketchup-sub','timngo')}/>
            <LayerToggle id="layer-gis-boundaries" attribute="data-gis-group" value="boundaries" checked={layers.boundaries} label="Ranh giới GIS" swatch="gis-supplementary" onChange={value=>changeLayer('boundaries',value,'gis','boundaries')}/>
          </fieldset>
          <p id="gis-layer-status" role="status">{gisStatus}</p>
          <p className="gis-attribution">Nền, đường phố, nhãn và nhà 3D OSM dùng dữ liệu OpenFreeMap/OpenMapTiles © OpenStreetMap. Các lớp GIS cục bộ cũng ghi nhận dữ liệu OSM; bật đồng thời có thể làm nét đường, nước và đường sắt trùng nhau.</p>
          <p id="model-status" role="status">{modelStatus}</p>
          <p id="building-note" hidden={raster}>{modelDescription} <a href="https://vanmieu.gov.vn/vi/visit/architecture" target="_blank" rel="noopener noreferrer">Danh mục công trình chính thức</a>.</p>
        </details>
      </section>

      <aside className={`details${detailsOpen?' open':''}`} id="details" aria-label="Chi tiết di tích"><button type="button" id="details-close" className="panel-close" aria-label="Đóng chi tiết di tích" onClick={()=>setDetailsOpen(false)}>×</button>
        <div id="details-content" className="details-content">
          {selectedSite&&<>
            <DetailCover key={selectedSite.id} site={selectedSite} index={selectedIndex} located={selectedLocated}/>
            <div className="detail-upper-row"><span className="detail-eyebrow">ĐỊA ĐIỂM · {String(selectedIndex).padStart(2,'0')} / {sites.length}</span><span className="detail-position">{selectedLocated?'ĐÃ CÓ TỌA ĐỘ TÂM':'CẦN XÁC MINH'}</span></div>
            <h2 className="detail-title">{selectedSite.name}</h2><div className="detail-subline"><Icon name="pin"/><span>{selectedSite.address}</span></div>
            <div className={`detail-status${selectedLocated?'':' warning'}`}><Icon name={selectedLocated?'check':'alert'}/><div><div className="detail-status-title">{selectedLocated?(selectedSite.coord_status==='osm_reference'?'Vị trí tham khảo OpenStreetMap':selectedSite.coord_status==='gis_reference'?'Vị trí tham khảo GIS dự án':'Vị trí theo danh mục chính thống'):'Chưa đủ tọa độ đáng tin'}</div><div className="detail-status-desc">{selectedLocated?selectedSite.coord_detail:'Chưa đủ chứng cứ để đặt pin; không suy đoán vị trí từ nhãn trên ảnh.'}</div></div></div>
            <div className="detail-section"><div className="detail-section-heading"><h3>Câu chuyện di sản</h3><span>GIỚI THIỆU</span></div><p className="detail-text">{selectedSite.summary}</p></div>
            <div className="detail-section"><div className="detail-section-heading"><h3>Thông tin địa lý</h3><span>KIỂM CHỨNG</span></div>
              <Fact title="Loại hình" value={selectedSite.kind}/><Fact title="Tọa độ WGS84" value={selectedLocated?`${selectedSite.lat.toFixed(6)}, ${selectedSite.lng.toFixed(6)}`:'Chưa có'}/>
              <Fact title="Nguồn tọa độ" value={selectedLocated?(selectedSite.coord_status==='osm_reference'?'OpenStreetMap · điểm tham khảo':selectedSite.coord_status==='gis_reference'?`GIS dự án · ${selectedSite.coordinate_record}`:`TT 10/2022 · PDF trang ${selectedSite.gazette_page}`):'Đang đối chiếu'}/><Fact title="Google Place ID" value="Chưa xác minh"/>
              {selectedSite.osm_crosscheck_m!=null&&<Fact title="So khớp OSM" value={`${selectedSite.osm_crosscheck_m} m giữa điểm tâm và dữ liệu OSM`}/>}
            </div>
            <div className="detail-section"><div className="detail-section-heading"><h3>Tuyến đi qua</h3><span>{selectedMembership.length} TUYẾN</span></div><div className="route-membership">{selectedMembership.length?selectedMembership.map(route=><button key={route.id} className="membership-pill" data-route={route.id} style={{'--pill-color':route.color}} onClick={()=>setRoute(route.id)}><span className="membership-dot"/>{route.id}</button>):<span className="detail-text">Không nằm trong 6 tuyến được chỉ định.</span>}</div></div>
            <button type="button" className="primary-action planner-detail-action" disabled={tourStops.includes(selectedSite.id)} onClick={()=>{addTourStop(selectedSite.id);setMenuOpen(true);setDetailsOpen(false);}}>{tourStops.includes(selectedSite.id)?'Đã có trong tour':'+ Thêm vào tour của bạn'}</button>
            <div className="detail-warning">{selectedSite.flag}</div>
            <div className="detail-actions"><a className="primary-action" href={selectedSite.maps_search_url} target="_blank" rel="noopener noreferrer"><Icon name="pin"/> Tìm trên Google Maps <Icon name="external"/></a></div>
            {selectedSite.ref&&<a className="secondary-action" style={{marginTop:8}} target="_blank" rel="noopener noreferrer" href={selectedSite.ref}><Icon name="book"/> Xem nguồn giới thiệu <Icon name="external"/></a>}
            {selectedSite.coordinate_source&&<a className="secondary-action" style={{marginTop:8}} target="_blank" rel="noopener noreferrer" href={selectedSite.coordinate_source}><Icon name="pin"/> Xem nguồn tọa độ <Icon name="external"/></a>}
          </>}
        </div>
      </aside>
    </main>
  </>;
}

function Fact({title,value}) { return <div className="detail-fact"><span>{title}</span><strong>{value}</strong></div>; }

function App() {
  const [route,setRoute] = useState(()=>window.location.hash);
  useEffect(()=>{
    const syncRoute=()=>setRoute(window.location.hash);
    window.addEventListener('hashchange',syncRoute);
    return ()=>window.removeEventListener('hashchange',syncRoute);
  },[]);
  if(route==='#/map') return <MapPage/>;
  if(route.startsWith('#/di-tich/')) return <SitePage id={route.slice('#/di-tich/'.length)}/>;
  return <HomePage/>;
}

export default App;
