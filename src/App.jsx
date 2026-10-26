import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import HomePage from './HomePage.jsx';

const ICONS = ['pin','route','walk','bike','search','arrow','external','check','alert','layers','compass','close','copy','filter','book'];
const LAYER_DEFAULTS = {
  base:true, roads:false, water:false, railways:false, buildings:false, sketchup:false, markers:true,
  boundaries:false, TPX_BUILDINGS:true, noithat:true, nha_khoi:true, timngo:true,
  TPX_ROADS_HATCH:false, TPX_WATERWAYS_HATCH:false, TPX_TERRAIN_TERRAIN_MESH:false,
  TPX_VEGETATION_GREEN_SPACES_HATCH:false
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
  const [perspective,setPerspective] = useState('2.5d');
  const [layers,setLayers] = useState(LAYER_DEFAULTS);
  const [mapStatus,setMapStatus] = useState({message:'Đang khởi tạo bản đồ…',level:'loading',renderer:'loading'});
  const [modelStatus,setModelStatus] = useState('SketchUp tắt mặc định. Tọa độ suy ra từ hình học GIS, chưa được khảo sát.');
  const [gisStatus,setGisStatus] = useState('Đang nạp lớp GIS…');
  const [menuOpen,setMenuOpen] = useState(false);
  const [detailsOpen,setDetailsOpen] = useState(false);
  const mapRef = useRef(null);
  const selectSiteRef = useRef(null);
  const focusAfterModelRef = useRef(false);
  const byRoute = routes.find(route=>route.id===routeId) || null;
  const selectedSite = byId[selected];
  const locatedCount = sites.filter(isLocated).length;
  const modelReady = document.getElementById('map')?.dataset.model === 'ready';
  const raster = mapStatus.renderer === 'raster';

  function membership(site) { return routes.filter(route=>route.sites.includes(site.id)); }
  function overview() { mapRef.current?.overview(); }
  function closeMobileMenu() { setMenuOpen(false); }
  function setRoute(id) {
    const requested = routes.find(route=>route.id===id);
    if (!requested) return;
    const next = routeId === id ? null : id;
    setRouteId(next);
    if (next) { setCategory(requested.mode); setSelected(requested.sites[1] || requested.sites[0]); mapRef.current?.fitRoute(requested); }
    else { setCategory('all'); overview(); }
    closeMobileMenu();
  }
  function selectSite(id) {
    const site = byId[id];
    if (!site) return;
    setSelected(id); setDetailsOpen(true); closeMobileMenu();
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
      element.style.setProperty('--marker',kindColor(site.kind)); element.title = `${site.name} — điểm tâm địa danh`;
      element.setAttribute('role','button'); element.setAttribute('tabindex','0'); element.setAttribute('aria-label',`Xem chi tiết ${site.name}`);
      element.innerHTML = `<div class="map-marker-label">${labelOf(site)}</div><div class="map-marker-core"><span class="marker-kind">${kindEmoji(site.kind)}</span><span class="marker-number"></span></div>`;
      const choose = () => selectSiteRef.current?.(site.id);
      element.addEventListener('click',choose);
      element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}});
      return element;
    };
    const engine = new window.HeritageMap({
      sites,makeMarker,
      onModelStatus:({message,state:modelState})=>{
        setModelStatus(message);
        if (modelState==='ready' && focusAfterModelRef.current) { focusAfterModelRef.current=false; engine.focusModel(); }
      },
      onLayerState:({sketchup,osmBuildings})=>setLayers(current=>({...current,
        ...(sketchup==null?{}:{sketchup}),...(osmBuildings==null?{}:{buildings:osmBuildings})})),
      onStatus:status=>setMapStatus(status)
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
  },[routeId,selected]);

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
  const selectedIndex = selectedSite ? sites.indexOf(selectedSite)+1 : 0;
  const selectedLocated = isLocated(selectedSite);
  const selectedMembership = selectedSite ? membership(selectedSite) : [];
  const activeModelCaption = raster ? 'NỀN 2D DỰ PHÒNG' : layers.sketchup ? 'SKETCHUP · VỊ TRÍ SUY RA TỪ GIS' : 'ĐƯỜNG PHỐ OSM · GIS TẮT MẶC ĐỊNH';
  const modelDescription = 'Mô hình SketchUp chưa có georeference. Chỉ bật sau khi kiểm tra; địa hình và hatch đường/nước đang ẩn để không phủ nền hoặc lặp lớp GIS.';
  const updateCategory = next=>{
    setCategory(next);
    if (byRoute && next!=='all' && byRoute.mode!==next) setRouteId(null);
    if (!byRoute || (next!=='all'&&byRoute.mode!==next)) overview();
  };
  const handleMapModel = ()=>{
    const next=!layers.sketchup;
    setLayers(current=>({...current,sketchup:next})); focusAfterModelRef.current=next;
    mapRef.current?.setSketchUpVisibility(next);
    if(next && mapRef.current?.modelState==='ready'){focusAfterModelRef.current=false;mapRef.current.focusModel();}
  };
  const resetRoute = ()=>{setRouteId(null);setCategory('all');overview();};
  const retryMap = ()=>{
    const engine=mapRef.current;
    if(!engine)return;
    setPerspective('2.5d');engine.mode='2.5d';engine.baseReady=false;engine.start();
  };
  const copyCoords = async id=>{
    const site=byId[id]; if(!isLocated(site))return;
    const value=`${site.lat}, ${site.lng}`;
    try { if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(value); else throw new Error('Clipboard unavailable'); }
    catch { window.prompt('Sao chép tọa độ',value); }
  };

  return <>
    <IconBank />
    <header className="topbar">
      <a className="brand-wrap" href="/" aria-label="Trở về trang chủ"><div className="brand-symbol"><span className="roof">⌃</span><span className="pillar">▥</span></div><div className="brand-copy"><span className="brand-name">DẤU CHÂN <em>DI SẢN</em></span><span className="brand-tagline">HERITAGE ATLAS · HÀ NỘI</span></div></a>
      <div className="topbar-center"><span className="status-dot" /> Hành trình qua những lớp ký ức Thăng Long <span className="top-divider" /> BẢN XEM TRƯỚC DỮ LIỆU</div>
      <div className="topbar-right"><a className="top-link" href="data/site-audit.csv" download><Icon name="book" /> Tải bảng 32 điểm</a><button className="menu-toggle" id="menu-toggle" aria-label="Mở tuyến và tìm di tích" aria-expanded={menuOpen} aria-controls="sidebar" onClick={()=>setMenuOpen(value=>!value)}><Icon name="filter" /><span>Tuyến & địa điểm</span></button><span className="edition-tag">BETA · 2026</span></div>
    </header>

    <main className="app-shell">
      <aside className={`sidebar${menuOpen?' open':''}`} id="sidebar">
        <button type="button" id="sidebar-close" className="panel-close" aria-label="Đóng danh sách tuyến" onClick={closeMobileMenu}>×</button>
        <div className="sidebar-scroll">
          <div className="eyebrow"><span className="eyebrow-line" /> KHÁM PHÁ HÀ NỘI</div>
          <h1>Di sản trong<br/><em>từng bước chân.</em></h1>
          <p className="hero-subtitle">Bản đồ 2.5D với vị trí đối soát từ địa danh chính thống và 6 hành trình của tài liệu gốc.</p>
          <div className="metrics"><div className="metric"><b id="metric-geocoded">{locatedCount}</b><span>điểm có tọa độ</span></div><div className="metric-divider"/><div className="metric"><b>06</b><span>hành trình</span></div><div className="metric-divider"/><div className="metric"><b>37</b><span>mục tiêu</span></div></div>
          <div className="section-row route-heading"><div><div className="kicker">BƯỚC 01</div><h2>Chọn tuyến tham quan</h2></div><span className="mini-count">06 tuyến</span></div>
          <div className="tabs" role="tablist" aria-label="Lọc loại tuyến">
            {[['all','Tất cả'],['walk',<><Icon name="walk"/> Đi bộ</>],['motorbike',<><Icon name="bike"/> Xe máy</>]].map(([value,label])=><button key={value} id={`tab-${value}`} className={`tab${category===value?' active':''}`} data-category={value} role="tab" aria-selected={category===value} onClick={()=>updateCategory(value)}>{label}</button>)}
          </div>
          <div className="route-list" id="route-list" aria-live="polite">
            {visibleRoutes.map(route=>{
              const missing=route.sites.filter(id=>!isLocated(byId[id])); const active=routeId===route.id;
              return <button key={route.id} type="button" className={`route-card${active?' active':''}`} data-route={route.id} style={{'--route-color':route.color}} aria-pressed={active} onClick={()=>setRoute(route.id)}>
                <div className="route-card-top"><span className="route-icon"><Icon name={route.mode==='walk'?'walk':'bike'}/></span><span className="route-text"><span className="route-code">{route.id} · {route.mode==='walk'?'ĐI BỘ':'XE MÁY'}</span><span className="route-title">{route.title}</span><span className="route-end">{route.sites.length} điểm ghé <i className="small-dot"/> {missing.length?`${missing.length} chờ định vị`:'đủ vị trí tâm'}</span></span><Icon name="arrow"/></div>
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
              const sub=located?`Tọa độ theo TT 10/2022 ${onRoute?'· Thuộc tuyến':''}`:'Chưa xác minh vị trí';
              return <button key={site.id} type="button" className={`site-row${selected===site.id?' selected':''}${dim?' dim':''}`} data-site={site.id} aria-current={selected===site.id} onClick={()=>selectSite(site.id)}>
                <span className="site-index">{String(index).padStart(2,'0')}</span><span className="site-row-text"><span className="site-row-name">{site.name}</span><span className="site-row-sub">{sub}</span></span><span className={`site-status-dot${located?'':' missing'}`}/>
              </button>;
            }):<div className="empty-list">Không tìm thấy di tích phù hợp.</div>}
          </div>
          <div className="sidebar-footnote"><Icon name="alert"/><p>PDF thể hiện 33 nhãn, tương ứng 32 địa điểm sau khi gộp tên trùng. <strong>Chênh 5 địa điểm so với mục tiêu 37; cần danh mục chính thức để xác định.</strong></p></div>
        </div>
      </aside>

      <section className="map-wrap" aria-label="Bản đồ địa điểm di sản">
        <div id="map" role="application" aria-label="Bản đồ OpenStreetMap tương tác, các điểm di tích có tọa độ chuyển đổi từ VN-2000" />
        <div id="map-failure" className="map-failure" hidden={!['error'].includes(mapStatus.level)} role="alert"><strong>Chưa tải được nền đường phố.</strong><span>Danh sách và chi tiết vẫn dùng được. Nhấn Tải lại khi có mạng.</span></div>
        <div className="map-caption"><span className="tiny-dot"/> HÀ NỘI · VĂN MIẾU – KHÂM THIÊN <span className="cap-separator">/</span><span id="view-caption">{activeModelCaption}</span></div>
        <div className="map-status" id="map-status" data-level={mapStatus.level} role="status" aria-live="polite"><span id="map-status-text">{mapStatus.message}</span><button type="button" id="map-retry" onClick={retryMap}>Tải lại</button><button type="button" id="map-raster" title="Dùng bản đồ đường phố 2D không cần WebGL" onClick={()=>mapRef.current?.fallback('Đã chọn nền 2D')}>Nền 2D</button></div>
        <div className="map-control-group">
          <button id="map-perspective" className="map-control" title="Chuyển góc nhìn 2D / 2.5D" disabled={raster} onClick={()=>{const next=perspective==='2.5d'?'2d':'2.5d';setPerspective(next);mapRef.current?.setPerspective(next);}}><Icon name="layers"/><span id="perspective-label">{raster?'2D':perspective.toUpperCase()}</span></button>
          <button id="map-model" type="button" className="map-control" title={raster?'SketchUp cần WebGL; nhấn Tải lại để thử bản đồ vector':layers.sketchup?'Tắt lớp công trình SketchUp':'Bật lớp công trình SketchUp'} aria-pressed={layers.sketchup} disabled={raster} onClick={handleMapModel}>SketchUp</button>
          <button id="map-reset" className="map-control icon-only" title="Về toàn cảnh" onClick={overview}><Icon name="compass"/></button>
          <button id="map-zoom-in" className="map-control square-control" title="Phóng to" onClick={()=>mapRef.current?.zoom(1)}>+</button>
          <button id="map-zoom-out" className="map-control square-control" title="Thu nhỏ" onClick={()=>mapRef.current?.zoom(-1)}>−</button>
        </div>
        <div id="floating-route" className="floating-route" hidden={!byRoute}>
          {byRoute&&<><div className="floating-route-label">{byRoute.id} · {byRoute.mode==='walk'?'ĐI BỘ':'XE MÁY'} · {byRoute.sites.length} ĐIỂM</div>
            <details className="route-itinerary"><summary>{byRoute.title} <span>Xem điểm ghé</span></summary><ol className="route-stops">{byRoute.sites.map((id,index)=>{
              const site=byId[id],located=isLocated(site);
              return <li key={id}><button type="button" data-site={id} className={located?'':'unlocated-stop'} onClick={()=>selectSite(id)}><b>{index+1}</b><span>{labelOf(site)}{!located&&<small>Chưa có tọa độ · chỉ xem chi tiết</small>}</span></button></li>;
            })}</ol></details>
            {byRoute.sites.some(id=>!isLocated(byId[id]))&&<p className="route-missing">{byRoute.sites.filter(id=>!isLocated(byId[id])).length} điểm chưa có tọa độ để đặt pin.</p>}
            <p className="route-disclaimer">Nét đứt = thứ tự ghé theo PDF, không phải đường đi.</p><button type="button" className="route-clear" data-reset-route="1" onClick={resetRoute}><Icon name="close"/> Bỏ chọn tuyến</button>
          </>}
        </div>
        <details className="map-key" id="map-key"><summary className="map-key-title">CHÚ GIẢI & KIỂM SOÁT LỚP</summary>
          <div className="map-key-entry"><span className="key-pin official"/> 25 tâm địa danh · Thông tư 10/2022</div><div className="map-key-entry"><span className="key-pin missing"/> 7 điểm chờ định vị · xem danh sách</div><div className="map-key-entry"><span className="key-dash"/> Nét nối sơ đồ, <strong>không phải đường đi</strong></div>
          <fieldset className="gis-layer-controls"><legend>Các lớp hiển thị</legend>
            <LayerToggle id="layer-osm-base" attribute="data-map-base" value="" checked={layers.base} label="Bản đồ nền OSM" swatch="gis-road" onChange={value=>changeLayer('base',value,'setMapBaseVisibility')}/>
            <LayerToggle id="layer-gis-roads" attribute="data-gis-group" value="roads" checked={layers.roads} label="Đường GIS" swatch="gis-road" onChange={value=>changeLayer('roads',value,'gis','roads')}/>
            <LayerToggle id="layer-gis-water" attribute="data-gis-group" value="water" checked={layers.water} label="Nước GIS" swatch="gis-water" onChange={value=>changeLayer('water',value,'gis','water')}/>
            <LayerToggle id="layer-gis-railways" attribute="data-gis-group" value="railways" checked={layers.railways} label="Đường sắt GIS" swatch="gis-rail" onChange={value=>changeLayer('railways',value,'gis','railways')}/>
            <LayerToggle id="layer-osm-buildings" attribute="data-map-buildings" value="" checked={layers.buildings} label="Nhà 3D OSM" swatch="gis-context" onChange={value=>changeLayer('buildings',value,'setOSMBuildingVisibility')}/>
            <LayerToggle id="layer-sketchup" attribute="data-map-sketchup" value="" checked={layers.sketchup} label="Công trình SketchUp" swatch="gis-boundary" disabled={raster} onChange={value=>changeLayer('sketchup',value,'setSketchUpVisibility')}/>
            <LayerToggle id="layer-markers" attribute="data-map-markers" value="" checked={layers.markers} label="Marker di tích" swatch="" onChange={value=>changeLayer('markers',value,'setMarkersVisibility')}/>
            <LayerToggle id="layer-sketchup-buildings" attribute="data-sketchup-layer" value="TPX_BUILDINGS" checked={layers.TPX_BUILDINGS} label="Nhà trong SketchUp" swatch="gis-context" disabled={raster||!modelReady} onChange={value=>changeLayer('TPX_BUILDINGS',value,'sketchup-sub','TPX_BUILDINGS')}/>
            <LayerToggle id="layer-sketchup-details" attribute="data-sketchup-layer" value="noithat" checked={layers.noithat} label="Nội thất SketchUp" swatch="gis-context" disabled={raster||!modelReady} onChange={value=>changeLayer('noithat',value,'sketchup-sub','noithat')}/>
            <LayerToggle id="layer-sketchup-blocks" attribute="data-sketchup-layer" value="nha_khoi" checked={layers.nha_khoi} label="Khối nhà SketchUp" swatch="gis-context" disabled={raster||!modelReady} onChange={value=>changeLayer('nha_khoi',value,'sketchup-sub','nha_khoi')}/>
            <LayerToggle id="layer-sketchup-annotations" attribute="data-sketchup-layer" value="timngo" checked={layers.timngo} label="Nhãn/hướng dẫn SketchUp" swatch="gis-context" disabled={raster||!modelReady} onChange={value=>changeLayer('timngo',value,'sketchup-sub','timngo')}/>
            <LayerToggle id="layer-sketchup-roads" attribute="data-sketchup-layer" value="TPX_ROADS_HATCH" checked={layers.TPX_ROADS_HATCH} label="Đường SketchUp" swatch="gis-road" disabled={raster||!modelReady} onChange={value=>changeLayer('TPX_ROADS_HATCH',value,'sketchup-sub','TPX_ROADS_HATCH')}/>
            <LayerToggle id="layer-sketchup-water" attribute="data-sketchup-layer" value="TPX_WATERWAYS_HATCH" checked={layers.TPX_WATERWAYS_HATCH} label="Nước SketchUp" swatch="gis-water" disabled={raster||!modelReady} onChange={value=>changeLayer('TPX_WATERWAYS_HATCH',value,'sketchup-sub','TPX_WATERWAYS_HATCH')}/>
            <LayerToggle id="layer-sketchup-terrain" attribute="data-sketchup-layer" value="TPX_TERRAIN_TERRAIN_MESH" checked={layers.TPX_TERRAIN_TERRAIN_MESH} label="Nền trắng / địa hình SketchUp" swatch="gis-boundary" disabled={raster||!modelReady} onChange={value=>changeLayer('TPX_TERRAIN_TERRAIN_MESH',value,'sketchup-sub','TPX_TERRAIN_TERRAIN_MESH')}/>
            <LayerToggle id="layer-sketchup-green" attribute="data-sketchup-layer" value="TPX_VEGETATION_GREEN_SPACES_HATCH" checked={layers.TPX_VEGETATION_GREEN_SPACES_HATCH} label="Mảng xanh SketchUp" swatch="gis-context" disabled={raster||!modelReady} onChange={value=>changeLayer('TPX_VEGETATION_GREEN_SPACES_HATCH',value,'sketchup-sub','TPX_VEGETATION_GREEN_SPACES_HATCH')}/>
            <LayerToggle id="layer-gis-boundaries" attribute="data-gis-group" value="boundaries" checked={layers.boundaries} label="Ranh giới GIS" swatch="gis-supplementary" onChange={value=>changeLayer('boundaries',value,'gis','boundaries')}/>
          </fieldset>
          <p id="gis-layer-status" role="status">{gisStatus}</p>
          <p className="gis-attribution">Nền, đường phố, nhãn và nhà 3D OSM dùng dữ liệu OpenFreeMap/OpenMapTiles © OpenStreetMap. Các lớp GIS cục bộ cũng ghi nhận dữ liệu OSM; bật đồng thời có thể làm nét đường, nước và đường sắt trùng nhau.</p>
          <p id="model-status" role="status">{modelStatus}</p>
          <p id="building-note" hidden={raster}>{modelDescription}</p>
        </details>
        <div className="map-bottom-banner"><Icon name="alert"/><span><strong>Dữ liệu tham khảo:</strong> Tâm địa danh đã chuyển VN-2000 → WGS84. Chưa xác minh cổng, lối xe máy, đường đi và Google Place ID.</span><a href="data/site-audit.csv" download>Kiểm tra nguồn <Icon name="arrow"/></a></div>
      </section>

      <aside className={`details${detailsOpen?' open':''}`} id="details" aria-label="Chi tiết di tích"><button type="button" id="details-close" className="panel-close" aria-label="Đóng chi tiết di tích" onClick={()=>setDetailsOpen(false)}>×</button>
        <div id="details-content" className="details-content">
          {selectedSite&&<>
            <div className={`detail-cover${selectedLocated?'':' cover-unlocated'}`}><span className="cover-floating">DI SẢN VĂN HÓA HÀ NỘI</span><span className="cover-category-tag">{selectedSite.kind.toUpperCase()}</span><span className="cover-architecture" aria-hidden="true">{kindEmoji(selectedSite.kind)}</span><span className="cover-num">{String(selectedIndex).padStart(2,'0')}</span></div>
            <div className="detail-upper-row"><span className="detail-eyebrow">ĐỊA ĐIỂM · {String(selectedIndex).padStart(2,'0')} / {sites.length}</span><span className="detail-position">{selectedLocated?'ĐÃ CÓ TỌA ĐỘ TÂM':'CẦN XÁC MINH'}</span></div>
            <h2 className="detail-title">{selectedSite.name}</h2><div className="detail-subline"><Icon name="pin"/><span>{selectedSite.address}</span></div>
            <div className={`detail-status${selectedLocated?'':' warning'}`}><Icon name={selectedLocated?'check':'alert'}/><div><div className="detail-status-title">{selectedLocated?'Vị trí theo danh mục chính thống':'Chưa đủ tọa độ đáng tin'}</div><div className="detail-status-desc">{selectedLocated?'Vị trí tâm tương đối đã chuyển từ hệ VN-2000 (2022) sang WGS84, chưa xác minh lối vào.':'Chưa đủ chứng cứ để đặt pin; không suy đoán vị trí từ nhãn trên ảnh.'}</div></div></div>
            <div className="detail-section"><div className="detail-section-heading"><h3>Câu chuyện di sản</h3><span>GIỚI THIỆU</span></div><p className="detail-text">{selectedSite.summary}</p></div>
            <div className="detail-section"><div className="detail-section-heading"><h3>Thông tin địa lý</h3><span>KIỂM CHỨNG</span></div>
              <Fact title="Loại hình" value={selectedSite.kind}/><Fact title="Tọa độ WGS84" value={selectedLocated?`${selectedSite.lat.toFixed(6)}, ${selectedSite.lng.toFixed(6)}`:'Chưa có'}/>
              <Fact title="Nguồn tọa độ" value={selectedLocated?`TT 10/2022 · PDF trang ${selectedSite.gazette_page}`:'Đang đối chiếu'}/><Fact title="Google Place ID" value="Chưa xác minh"/>
              {selectedSite.osm_crosscheck_m!=null&&<Fact title="So khớp OSM" value={`${selectedSite.osm_crosscheck_m} m giữa điểm tâm và dữ liệu OSM`}/>}
            </div>
            <div className="detail-section"><div className="detail-section-heading"><h3>Tuyến đi qua</h3><span>{selectedMembership.length} TUYẾN</span></div><div className="route-membership">{selectedMembership.length?selectedMembership.map(route=><button key={route.id} className="membership-pill" data-route={route.id} style={{'--pill-color':route.color}} onClick={()=>setRoute(route.id)}><span className="membership-dot"/>{route.id}</button>):<span className="detail-text">Không nằm trong 6 tuyến được chỉ định.</span>}</div></div>
            <div className="detail-warning">{selectedSite.flag}</div>
            <div className="detail-actions"><a className="primary-action" href={selectedSite.maps_search_url} target="_blank" rel="noopener noreferrer"><Icon name="pin"/> Tìm trên Google Maps <Icon name="external"/></a>
              {selectedLocated&&<button type="button" className="secondary-action" data-copy-coords={selectedSite.id} onClick={()=>copyCoords(selectedSite.id)}><Icon name="copy"/> Sao chép tọa độ</button>}</div>
            {selectedSite.gazette_pdf&&<a href={selectedSite.gazette_pdf} rel="noopener noreferrer" target="_blank" className="secondary-action"><Icon name="book"/> Xem văn bản tọa độ <Icon name="external"/></a>}
            {selectedSite.ref&&<a className="secondary-action" style={{marginTop:8}} target="_blank" rel="noopener noreferrer" href={selectedSite.ref}><Icon name="book"/> Xem nguồn giới thiệu <Icon name="external"/></a>}
            <p className="small-note">Địa chỉ và danh mục Google Maps chưa được kiểm tra trực tiếp qua Places API. Dữ liệu bản đồ thể hiện vị trí địa danh, không thay cho khảo sát cổng vào hay chỉ đường thực địa.</p>
          </>}
        </div>
      </aside>
    </main>
  </>;
}

function Fact({title,value}) { return <div className="detail-fact"><span>{title}</span><strong>{value}</strong></div>; }

function App() {
  const [mapOpen,setMapOpen] = useState(()=>window.location.hash==='#/map');
  useEffect(()=>{
    const syncRoute=()=>setMapOpen(window.location.hash==='#/map');
    window.addEventListener('hashchange',syncRoute);
    return ()=>window.removeEventListener('hashchange',syncRoute);
  },[]);
  return mapOpen ? <MapPage/> : <HomePage/>;
}

export default App;
