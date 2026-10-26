/*
 * Heritage Atlas review prototype.
 * GIS positions: VN-2000 gazette centroids transformed to WGS84.
 * Colored dashed connectors are thematic stop sequences, NOT road routes.
 * No Google Maps data has been scraped or claimed verified.
 */
(function () {
  'use strict';
  const root = window.HERITAGE_DATA;
  if (!root) {
    document.body.insertAdjacentHTML('beforeend', '<p role="alert">Không tìm thấy dữ liệu. Hãy giữ data.js cạnh index.html.</p>');
    return;
  }
  const {sites, routes} = root;
  const $ = selector => document.querySelector(selector);
  const byId = Object.fromEntries(sites.map(s => [s.id, s]));
  const state = {
    category: 'all', route: null, selected: 'van_mieu', search: '',
    perspective: '2.5d', map: null
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  }
  function normalize(value) { return value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g,'d'); }
  function icon(name) { return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`; }
  function labelOf(s) {
    return s.name.replace(/\s*\([^)]*\)/g, '').replace('Đình làng', 'Đình').replace('Đền Mẫu Sòng Sơn – Hà Nội', 'Đền Sòng Sơn');
  }
  function kindEmoji(kind) {
    return ({'chùa':'🛕', 'đền':'⛩', 'đình':'🏯', 'di-tích':'📚', 'tưởng-niệm':'🕯', 'hồ':'💧', 'đình–đền':'🏯'})[kind] || '⌂';
  }
  function kindColor(kind) {
    return ({'chùa':'#568a68', 'đền':'#bb8064', 'đình':'#46788b', 'di-tích':'#b28d47', 'tưởng-niệm':'#866fa6', 'hồ':'#329aa3', 'đình–đền':'#658477'})[kind] || '#39785d';
  }
  function isLocated(site) { return Number.isFinite(site.lat) && Number.isFinite(site.lng); }
  function activeRoute() { return routes.find(r => r.id === state.route) || null; }
  function membership(site) { return routes.filter(r => r.sites.includes(site.id)); }

  function renderRoutes() {
    const list = $('#route-list');
    const visible = routes.filter(r => state.category === 'all' || r.mode === state.category);
    list.innerHTML = visible.map(r => {
      const active = state.route === r.id;
      const badge = r.mode === 'walk' ? icon('walk') : icon('bike');
      const missing = r.sites.filter(id => !isLocated(byId[id]));
      return `<button type="button" class="route-card ${active ? 'active' : ''}" data-route="${r.id}" style="--route-color:${r.color}" aria-pressed="${active}">
        <div class="route-card-top"><span class="route-icon">${badge}</span><span class="route-text"><span class="route-code">${r.id} · ${r.mode === 'walk' ? 'ĐI BỘ' : 'XE MÁY'}</span><span class="route-title">${escapeHtml(r.title)}</span><span class="route-end">${r.sites.length} điểm ghé <i class="small-dot"></i> ${missing.length ? `${missing.length} chờ định vị` : 'đủ vị trí tâm'}</span></span>${icon('arrow')}</div>
      </button>`;
    }).join('');
    if (state.route) list.insertAdjacentHTML('beforeend', `<button type="button" class="route-clear" data-reset-route="1">${icon('close')} Bỏ chọn tuyến · Hiện tất cả điểm</button>`);
    document.querySelectorAll('.tab').forEach(b => {
      const on = b.dataset.category === state.category;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    renderFloatingRoute();
  }

  function renderFloatingRoute() {
    const el = $('#floating-route');
    const r = activeRoute();
    if (!r) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.style.setProperty('--active-route', r.color);
    const missing = r.sites.filter(id => !isLocated(byId[id]));
    el.innerHTML = `<div class="floating-route-label">${r.id} · ${r.mode === 'walk' ? 'ĐI BỘ' : 'XE MÁY'} · ${r.sites.length} ĐIỂM</div>
      <details class="route-itinerary"><summary>${escapeHtml(r.title)} <span>Xem điểm ghé</span></summary>
      <ol class="route-stops">${r.sites.map((id,i) => `<li><button type="button" data-site="${id}" class="${isLocated(byId[id]) ? '' : 'unlocated-stop'}"><b>${i+1}</b><span>${escapeHtml(labelOf(byId[id]))}${!isLocated(byId[id]) ? '<small>Chưa có tọa độ · chỉ xem chi tiết</small>' : ''}</span></button></li>`).join('')}</ol></details>
      ${missing.length ? `<p class="route-missing">${missing.length} điểm chưa có tọa độ để đặt pin.</p>` : ''}
      <p class="route-disclaimer">Nét đứt = thứ tự ghé theo PDF, không phải đường đi.</p>
      <button type="button" class="route-clear" data-reset-route="1">${icon('close')} Bỏ chọn tuyến</button>`;
  }

  function renderSiteList() {
    const currentRoute = activeRoute();
    const ordered = [...sites];
    if (currentRoute) ordered.sort((a,b) => {
      const ai = currentRoute.sites.indexOf(a.id), bi = currentRoute.sites.indexOf(b.id);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
    const term = normalize(state.search.trim());
    const visible = ordered.filter(s => !term || normalize([s.name, ...s.aliases, s.kind].join(' ')).includes(term));
    $('#site-count').textContent = `${visible.length}/${sites.length} điểm`;
    $('#site-list').innerHTML = visible.length ? visible.map(s => {
      const idx = currentRoute && currentRoute.sites.includes(s.id) ? currentRoute.sites.indexOf(s.id) + 1 : sites.indexOf(s) + 1;
      const located = isLocated(s);
      const onRoute = currentRoute && currentRoute.sites.includes(s.id);
      const dim = currentRoute && !onRoute && state.selected !== s.id;
      const sub = located ? `Tọa độ theo TT 10/2022 ${onRoute ? '· Thuộc tuyến' : ''}` : 'Chưa xác minh vị trí';
      return `<button type="button" class="site-row ${state.selected === s.id ? 'selected' : ''} ${dim ? 'dim' : ''}" data-site="${s.id}" aria-current="${state.selected === s.id}">
        <span class="site-index">${String(idx).padStart(2,'0')}</span><span class="site-row-text"><span class="site-row-name">${escapeHtml(s.name)}</span><span class="site-row-sub">${escapeHtml(sub)}</span></span><span class="site-status-dot ${located ? '' : 'missing'}"></span>
      </button>`;
    }).join('') : '<div class="empty-list">Không tìm thấy di tích phù hợp.</div>';
  }

  function renderDetails() {
    const site = byId[state.selected];
    if (!site) return;
    const index = sites.indexOf(site) + 1;
    const located = isLocated(site);
    const fact = (title,value) => `<div class="detail-fact"><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong></div>`;
    const closeClass = located ? '' : 'warning';
    const detailText = located ? `Vị trí tâm tương đối đã chuyển từ hệ VN-2000 (2022) sang WGS84, chưa xác minh lối vào.` : 'Chưa đủ chứng cứ để đặt pin; không suy đoán vị trí từ nhãn trên ảnh.';
    const sourceLink = site.gazette_pdf ? `<a href="${escapeHtml(site.gazette_pdf)}" rel="noopener noreferrer" target="_blank" class="secondary-action">${icon('book')} Xem văn bản tọa độ ${icon('external')}</a>` : '';
    const routeLinks = membership(site).map(r => `<button class="membership-pill" data-route="${r.id}" style="--pill-color:${r.color}"><span class="membership-dot"></span>${r.id}</button>`).join('');
    $('#details-content').innerHTML = `
      <div class="detail-cover ${located ? '' : 'cover-unlocated'}"><span class="cover-floating">DI SẢN VĂN HÓA HÀ NỘI</span><span class="cover-category-tag">${escapeHtml(site.kind.toUpperCase())}</span><span class="cover-architecture" aria-hidden="true">${kindEmoji(site.kind)}</span><span class="cover-num">${String(index).padStart(2,'0')}</span></div>
      <div class="detail-upper-row"><span class="detail-eyebrow">ĐỊA ĐIỂM · ${String(index).padStart(2,'0')} / ${sites.length}</span><span class="detail-position">${located ? 'ĐÃ CÓ TỌA ĐỘ TÂM' : 'CẦN XÁC MINH'}</span></div>
      <h2 class="detail-title">${escapeHtml(site.name)}</h2><div class="detail-subline">${icon('pin')} <span>${escapeHtml(site.address)}</span></div>
      <div class="detail-status ${closeClass}">${icon(located ? 'check' : 'alert')}<div><div class="detail-status-title">${located ? 'Vị trí theo danh mục chính thống' : 'Chưa đủ tọa độ đáng tin'}</div><div class="detail-status-desc">${escapeHtml(detailText)}</div></div></div>
      <div class="detail-section"><div class="detail-section-heading"><h3>Câu chuyện di sản</h3><span>GIỚI THIỆU</span></div><p class="detail-text">${escapeHtml(site.summary)}</p></div>
      <div class="detail-section"><div class="detail-section-heading"><h3>Thông tin địa lý</h3><span>KIỂM CHỨNG</span></div>
        ${fact('Loại hình',site.kind)}${fact('Tọa độ WGS84',located ? `${site.lat.toFixed(6)}, ${site.lng.toFixed(6)}` : 'Chưa có')}
        ${fact('Nguồn tọa độ',located ? `TT 10/2022 · PDF trang ${site.gazette_page}` : 'Đang đối chiếu')}
        ${fact('Google Place ID','Chưa xác minh')}
        ${site.osm_crosscheck_m != null ? fact('So khớp OSM',`${site.osm_crosscheck_m} m giữa điểm tâm và dữ liệu OSM`) : ''}
      </div>
      <div class="detail-section"><div class="detail-section-heading"><h3>Tuyến đi qua</h3><span>${membership(site).length} TUYẾN</span></div><div class="route-membership">${routeLinks || '<span class="detail-text">Không nằm trong 6 tuyến được chỉ định.</span>'}</div></div>
      <div class="detail-warning">${escapeHtml(site.flag)}</div>
      <div class="detail-actions">
        <a class="primary-action" href="${escapeHtml(site.maps_search_url)}" target="_blank" rel="noopener noreferrer">${icon('pin')} Tìm trên Google Maps ${icon('external')}</a>
        ${located ? `<button type="button" class="secondary-action" data-copy-coords="${site.id}">${icon('copy')} Sao chép tọa độ</button>` : ''}
      </div>
      ${sourceLink}
      ${site.ref ? `<a class="secondary-action" style="margin-top:8px" target="_blank" rel="noopener noreferrer" href="${escapeHtml(site.ref)}">${icon('book')} Xem nguồn giới thiệu ${icon('external')}</a>` : ''}
      <p class="small-note">Địa chỉ và danh mục Google Maps chưa được kiểm tra trực tiếp qua Places API. Dữ liệu bản đồ thể hiện vị trí địa danh, không thay cho khảo sát cổng vào hay chỉ đường thực địa.</p>
    `;
  }

  function renderAll() {
    renderRoutes();
    renderSiteList();
    renderDetails();
    updateMarkers();
  }

  function setRoute(id) {
    const requested = routes.find(r => r.id === id);
    if (!requested) return;
    state.route = state.route === id ? null : id;
    if (state.route) {
      state.category = requested.mode;
      state.selected = requested.sites[1] || requested.sites[0];
    } else { state.category = 'all'; }
    renderAll();
    if (state.route) zoomToRoute(requested); else overview();
    closeMobileMenu();
  }

  function selectSite(id) {
    const site = byId[id];
    if (!site) return;
    state.selected = id;
    $('#details').classList.add('open');
    $('#details').scrollTop = 0;
    renderDetails();
    renderSiteList();
    updateMarkers();
    state.map?.focus(site);
    closeMobileMenu();
  }

  function closeMobileMenu() { $('#sidebar').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded','false'); }
  function overview() { state.map?.overview(); }
  function zoomToRoute(route) { state.map?.fitRoute(route); }
  function createMarker(site) {
    const el = document.createElement('div');
    el.className = 'map-marker';
    el.dataset.siteId = site.id;
    el.dataset.color = kindColor(site.kind);
    el.style.setProperty('--marker',kindColor(site.kind));
    el.title = `${site.name} — điểm tâm địa danh`;
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    el.setAttribute('aria-label',`Xem chi tiết ${site.name}`);
    el.innerHTML = `<div class="map-marker-label">${escapeHtml(labelOf(site))}</div><div class="map-marker-core"><span class="marker-kind">${kindEmoji(site.kind)}</span><span class="marker-number"></span></div>`;
    el.addEventListener('click',() => selectSite(site.id));
    el.addEventListener('keydown',e => {if(e.key === 'Enter' || e.key === ' ') {e.preventDefault();selectSite(site.id);}});
    return el;
  }
  function updateMarkers() { state.map?.render(activeRoute(),state.selected); }
  function initMap() {
    function updateModelInfo(renderer = state.map?.kind) {
      const raster = renderer === 'raster';
      const modelReady = state.map?.modelState === 'ready';
      const enabled = Boolean($('#layer-sketchup').checked);
      $('#map-model').disabled = raster;
      $('#map-model').setAttribute('aria-pressed',String(enabled));
      $('#map-model').title = raster ? 'SketchUp cần WebGL; nhấn Tải lại để thử bản đồ vector' : enabled ? 'Tắt lớp công trình SketchUp' : 'Bật lớp công trình SketchUp';
      $('#view-caption').textContent = raster ? 'NỀN 2D DỰ PHÒNG' : enabled ? 'SKETCHUP · VỊ TRÍ SUY RA TỪ GIS' : 'ĐƯỜNG PHỐ OSM · GIS TẮT MẶC ĐỊNH';
      $('#building-note').hidden = raster;
      $('#building-note').textContent = 'Mô hình SketchUp chưa có georeference. Chỉ bật sau khi kiểm tra; địa hình và hatch đường/nước đang ẩn để không phủ nền hoặc lặp lớp GIS.';
      document.querySelectorAll('[data-sketchup-layer]').forEach(input => { input.disabled = raster || !modelReady; });
      if (raster) $('#model-status').textContent = 'Nền dự phòng 2D; mô hình SketchUp cần WebGL. Nhấn Tải lại để thử bản đồ vector.';
    }
    state.map = new window.HeritageMap({sites,makeMarker:createMarker,
      onModelStatus:({message,state:modelState}) => {
        $('#model-status').textContent = message;
        updateModelInfo();
        if (modelState === 'ready' && state.focusAfterSketchUp) {
          state.focusAfterSketchUp = false;
          state.map?.focusModel();
        }
      },
      onLayerState:({sketchup,osmBuildings}) => {
        if (sketchup != null) $('#layer-sketchup').checked = sketchup;
        if (osmBuildings != null) $('#layer-osm-buildings').checked = osmBuildings;
        updateModelInfo();
      },
      onStatus:({message,level,renderer}) => {
        $('#map-status-text').textContent = message;
        $('#map-status').dataset.level = level;
        $('#map-failure').hidden = level !== 'error';
        const raster = renderer === 'raster';
        $('#perspective-label').textContent = raster ? '2D' : state.perspective.toUpperCase();
        $('#map-perspective').disabled = raster;
        $('#map-perspective').title = raster ? 'Nền dự phòng 2D; thử lại 2.5D bằng nút Tải lại' : 'Chuyển góc nhìn 2D / 2.5D';
        updateModelInfo(renderer);
      }
    });
    state.map.start();
    updateMarkers();
    new ResizeObserver(() => state.map.resize()).observe($('#map'));
    if (window.HeritageGIS) {
      window.HeritageGIS.load().then(({manifest,layers}) => {
        state.map.setGISData(layers);
        const count = Object.values(layers).reduce((total, layer) => total + layer.features.length, 0);
        $('#gis-layer-status').textContent = `${Object.keys(layers).length} lớp GIS · ${count.toLocaleString('vi-VN')} đối tượng; lớp điểm kiểm toán không hiển thị.`;
        $('#map').dataset.gisReady = 'true';
        $('#map').dataset.gisStatus = manifest?.status || 'bundled';
      }).catch(error => {
        console.warn('Không nạp được lớp GIS cục bộ:', error);
        $('#gis-layer-status').textContent = 'Lớp GIS cục bộ chưa tải được; bản đồ nền và danh mục vẫn hoạt động.';
        $('#map').dataset.gisReady = 'false';
      });
    }
  }

  document.addEventListener('click', e => {
    const route = e.target.closest('[data-route]');
    if (route) { setRoute(route.dataset.route); return; }
    const site = e.target.closest('[data-site]');
    if (site) { selectSite(site.dataset.site); return; }
    const resetRoute = e.target.closest('[data-reset-route]');
    if(resetRoute) {state.route = null;state.category = 'all';renderAll();overview();return;}
    const category = e.target.closest('[data-category]');
    if(category){
      state.category=category.dataset.category;
      if(activeRoute() && state.category !== 'all' && activeRoute().mode !== state.category) state.route=null;
      renderAll();
      if(!state.route) overview();
      return;
    }
    const copy = e.target.closest('[data-copy-coords]');
    if(copy) {
      const s = byId[copy.dataset.copyCoords];
      if(!s || !isLocated(s)) return;
      const value = `${s.lat}, ${s.lng}`;
      if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(() => {copy.textContent = '✓ Đã sao chép';}).catch(() => window.prompt('Sao chép tọa độ',value));
      else window.prompt('Sao chép tọa độ', value);
    }
  });
  $('#site-search').addEventListener('input', e => {state.search=e.target.value;renderSiteList();});
  $('#map-reset').addEventListener('click',() => overview());
  $('#map-zoom-in').addEventListener('click',() => state.map?.zoom(1));
  $('#map-zoom-out').addEventListener('click',() => state.map?.zoom(-1));
  $('#map-perspective').addEventListener('click',() => {
    state.perspective=state.perspective === '2.5d' ? '2d' : '2.5d';
    $('#perspective-label').textContent=state.perspective.toUpperCase();
    state.map?.setPerspective(state.perspective);
  });
  $('#map-retry').addEventListener('click',() => {state.perspective='2.5d';state.map.mode='2.5d';state.map.baseReady=false;state.map.start();});
  $('#map-model').addEventListener('click',() => {
    $('#layer-sketchup').checked = !$('#layer-sketchup').checked;
    state.focusAfterSketchUp = $('#layer-sketchup').checked;
    $('#layer-sketchup').dispatchEvent(new Event('change',{bubbles:true}));
    if ($('#layer-sketchup').checked && state.map?.modelState === 'ready') {
      state.focusAfterSketchUp = false;
      state.map.focusModel();
    }
  });
  $('#map-raster').addEventListener('click',() => state.map.fallback('Đã chọn nền 2D'));
  $('#layer-osm-base').addEventListener('change',event => state.map?.setMapBaseVisibility(event.target.checked));
  $('#layer-osm-buildings').addEventListener('change',event => state.map?.setOSMBuildingVisibility(event.target.checked));
  $('#layer-sketchup').addEventListener('change',event => state.map?.setSketchUpVisibility(event.target.checked));
  $('#layer-markers').addEventListener('change',event => state.map?.setMarkersVisibility(event.target.checked));
  document.querySelectorAll('[data-gis-group]').forEach(input => input.addEventListener('change', () => {
    state.map?.setGISVisibility(input.dataset.gisGroup, input.checked);
  }));
  document.querySelectorAll('[data-sketchup-layer]').forEach(input => input.addEventListener('change', () => {
    state.map?.setSketchUpLayerVisibility(input.dataset.sketchupLayer,input.checked);
  }));
  $('#menu-toggle').addEventListener('click',() => {
    const open = $('#sidebar').classList.toggle('open');
    $('#menu-toggle').setAttribute('aria-expanded',String(open));
  });
  $('#sidebar-close').addEventListener('click',closeMobileMenu);
  $('#details-close').addEventListener('click',() => $('#details').classList.remove('open'));
  document.addEventListener('keydown',e => {if(e.key === 'Escape') {closeMobileMenu();$('#details').classList.remove('open');}});

  $('#metric-geocoded').textContent=sites.filter(isLocated).length;
  renderAll();
  initMap();
})();
