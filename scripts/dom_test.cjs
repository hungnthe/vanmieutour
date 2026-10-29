const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname,'..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const dom = new JSDOM(html, {runScripts:'outside-only',url:'http://localhost:8765/#/map',pretendToBeVisual:true});
const {window} = dom;
const {document} = window;
window.ResizeObserver = class { observe() {} disconnect() {} };
window.HTMLCanvasElement.prototype.getContext = () => null;

window.eval(fs.readFileSync(path.join(root,'data.js'),'utf8'));
window.eval(fs.readFileSync(path.join(root,'map-engine.js'),'utf8'));
window.eval(fs.readFileSync(path.join(root,'app.bundle.js'),'utf8'));

const tick = () => new Promise(resolve=>setTimeout(resolve,0));
const click = async selector => {
  const item = document.querySelector(selector);
  assert(item,`Missing element: ${selector}`);
  item.click();
  await tick();
};
const $count = selector => document.querySelectorAll(selector).length;

(async()=>{
assert.strictEqual($count('.route-card'),6);
assert.strictEqual($count('.site-row'),32);
assert.strictEqual($count('[data-gis-group]'),4,'GIS overlays are independently grouped by roads, water, rail and boundaries');
assert.strictEqual($count('[data-sketchup-layer]'),3,'The Văn Miếu scene exposes its three source groups');
assert.strictEqual($count('[data-gis-layer="heritage_points_review"]'),0,'Unverified candidate points are not exposed in the public map UI');
assert.strictEqual(document.querySelector('[data-map-base]').checked,true,'OSM is the default base layer');
assert.strictEqual(document.querySelector('#map-mode-2d').getAttribute('aria-pressed'),'true','The full-area 2D view is the default');
assert.strictEqual(document.querySelector('#map-mode-3d').getAttribute('aria-pressed'),'false','The Văn Miếu model is opt-in');
assert.strictEqual(document.querySelector('[data-map-buildings]').checked,false,'OSM 3D buildings are off until selected');
assert([...document.querySelectorAll('[data-gis-group]')].every(input=>!input.checked),'GIS overlays do not duplicate OSM by default');
assert.strictEqual(document.querySelector('#metric-geocoded').textContent,'32');
assert.strictEqual($count('.map-marker'),0, 'No fake pins without a map provider');
assert.strictEqual(document.querySelector('#map-failure').hidden,false);

// The map details use the very same photo key as the 2D illustrated landmark.
const mapPhotos=JSON.parse(fs.readFileSync(path.join(root,'src/landmark-photos.json'),'utf8'));
for(const site of window.HERITAGE_DATA.sites) {
  await click(`.site-row[data-site="${site.id}"]`);
  const photo=document.querySelector('.detail-cover-photo');
  if(mapPhotos[site.id]) {
    assert(photo,`${site.name} should use its 2D photograph`);
    assert.strictEqual(photo.dataset.sitePhoto,site.id,`${site.name} must keep its own photo key`);
    assert.strictEqual(photo.getAttribute('src'),mapPhotos[site.id].src,`${site.name} must use the 2D photo`);
  } else {
    assert(!photo,`${site.name} should keep the original cover without a photo`);
    assert(document.querySelector('.detail-cover .cover-architecture'),`${site.name} keeps its original icon`);
  }
}
await click('.site-row[data-site="ngoc_ho"]');
document.querySelector('.detail-cover-photo').dispatchEvent(new window.Event('error',{bubbles:true}));
for(let attempt=0;attempt<20&&document.querySelector('.detail-cover-photo');attempt++) await new Promise(resolve=>setTimeout(resolve,10));
assert(!document.querySelector('.detail-cover-photo'),'A failed photo falls back to the original cover');
assert(document.querySelector('.detail-cover .cover-architecture'),'The original icon remains available after a photo error');
await click('.site-row[data-site="ba_nanh"]');
assert.strictEqual(document.querySelector('.detail-cover-photo')?.getAttribute('src'),mapPhotos.ba_nanh.src,'Bà Nành uses its own 2D image, rather than the separate Tiên Phúc label photo');

await click('[data-route="W02"]');
assert.strictEqual(document.querySelector('[data-route="W02"]').getAttribute('aria-pressed'),'true');
assert(document.querySelector('#floating-route').textContent.includes('Chùa Ngọc Hồ'));
assert.strictEqual(document.querySelector('.floating-route-toggle').getAttribute('aria-expanded'),'false','Route details start folded on narrow screens');
await click('.floating-route-toggle');
assert.strictEqual(document.querySelector('.floating-route-toggle').getAttribute('aria-expanded'),'true','Route details can be opened');
await click('.floating-route-toggle');
assert.strictEqual(document.querySelector('.floating-route-toggle').getAttribute('aria-expanded'),'false','Route details can be folded again');
assert.strictEqual($count('.site-row.dim'),29);

await click('#tab-motorbike');
assert.strictEqual($count('.route-card'),3);
await click('[data-route="R02"]');
assert(!document.querySelector('#floating-route').textContent.includes('điểm chưa có tọa độ'));

const search = async value => {
  const input=document.querySelector('#site-search');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);
  input.dispatchEvent(new window.Event('input',{bubbles:true}));
  await tick();
};
await search('Khâm Đức');
assert.strictEqual($count('.site-row'),2);
await click('[data-site="kham_duc_dinh"]');
assert(document.querySelector('.detail-status-title').textContent.includes('GIS dự án'));
assert(document.querySelector('.detail-title').textContent.includes('Khâm Đức'));
assert.strictEqual(document.querySelector('#details').classList.contains('open'),true);
// Accent-insensitive search and stop order are user-facing behavior.
await search('kham duc');
assert.strictEqual($count('.site-row'),2);
await click('#tab-walk');
assert.strictEqual(document.querySelector('#floating-route').hidden,true,'Changing mode clears a route from the other group');
await click('#route-list [data-route="W02"]');
assert.deepStrictEqual([...document.querySelectorAll('.route-stops [data-site]')].map(e=>e.dataset.site),['van_mieu','ngoc_ho','y_mieu']);
await click('.route-stops [data-site="y_mieu"]');
assert.strictEqual(document.querySelector('.detail-title').textContent,'Y Miếu');

await search('');
await click('[data-reset-route]');
assert.strictEqual($count('.route-card'),6);
assert.strictEqual($count('.site-row.dim'),0);
assert.strictEqual(window.HERITAGE_DATA.routes.length,6);
assert.strictEqual(window.HERITAGE_DATA.sites.filter(s => s.lat === null).length,0);
assert.strictEqual(window.HERITAGE_DATA.sites.filter(s => s.lat !== null).length,32);
await click('.site-row[data-site="trung_kinh"]');
assert(document.querySelector('.detail-status-title').textContent.includes('OpenStreetMap'));
assert(document.querySelector('.detail-status-desc').textContent.includes('chưa xác minh cổng'));

await click('#open-tour-planner');
const tourSearch=document.querySelector('#tour-search');
Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(tourSearch,'nguyen khuyen');
tourSearch.dispatchEvent(new window.Event('input',{bubbles:true}));
await tick();
assert([...document.querySelectorAll('.planner-result')].some(row=>row.textContent.includes('Chùa Ngọc Hồ')),'Street search finds the associated address without accents');
await click('button[aria-label="Thêm Chùa Ngọc Hồ (Bà Ngô) vào tour"]');
Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(tourSearch,'Khâm Đức');
tourSearch.dispatchEvent(new window.Event('input',{bubbles:true}));
await tick();
await click('button[aria-label="Thêm Đình Khâm Đức vào tour"]');
assert(!document.querySelector('.planner-stops').textContent.includes('Chưa có tọa độ'),'GIS reference is available for a custom tour');
await click('button[aria-label="Đưa Đình Khâm Đức lên"]');
assert(document.querySelector('.planner-stops li:first-child').textContent.includes('Đình Khâm Đức'),'Reordering preserves the chosen stop');
await click('#preview-tour');
assert.deepStrictEqual([...document.querySelectorAll('#floating-route .route-stops button')].map(button=>button.dataset.site),['kham_duc_dinh','ngoc_ho'],'Preview preserves all selected stops and their order');
assert(document.querySelector('#floating-route').textContent.includes('Nguyễn Khuyến'),'Preview shows addresses');
assert.strictEqual(document.querySelector('.floating-route-toggle').getAttribute('aria-expanded'),'false','Custom tour keeps the map clear until details are requested');
await click('button[aria-label="Bỏ Đình Khâm Đức"]');
assert.strictEqual(document.querySelectorAll('.planner-stops li').length,1,'A selected stop can be removed');
Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(tourSearch,'Trung Kính');
tourSearch.dispatchEvent(new window.Event('input',{bubbles:true}));
await tick();
await click('button[aria-label="Thêm Đình Trung Kính vào tour"]');
assert(!document.querySelector('.planner-stops').textContent.includes('Chưa có tọa độ'),'The sourced point can be included in a custom tour');
await click('#preview-tour');
assert.deepStrictEqual([...document.querySelectorAll('#floating-route .route-stops button')].map(button=>button.dataset.site),['ngoc_ho','trung_kinh']);
assert(!document.querySelector('#floating-route').textContent.includes('chưa có tọa độ'),'The custom route is not blocked by a missing coordinate');

console.log('DOM checks passed: 32 sites with coordinates, 6 routes, categories, click details, searching and custom tours.');
dom.window.close();

const homeDom = new JSDOM(html, {runScripts:'outside-only',url:'http://localhost:8765/',pretendToBeVisual:true});
homeDom.window.eval(fs.readFileSync(path.join(root,'data.js'),'utf8'));
homeDom.window.eval(fs.readFileSync(path.join(root,'app.bundle.js'),'utf8'));
assert.strictEqual(homeDom.window.document.querySelector('#home-title')?.textContent.replace(/\s+/g,'').trim(),'ChạmvàokýứcngànnămThăngLong.');
assert.strictEqual(homeDom.window.document.querySelector('.home-hero-image')?.getAttribute('src'),'assets/van-mieu-home-hero.webp');
assert.strictEqual(homeDom.window.document.querySelector('#map'),null,'The map must not mount behind the default homepage.');
assert(homeDom.window.document.querySelector('a[href="#/map"]'),'The homepage exposes a route into the existing map.');
assert.strictEqual(homeDom.window.document.querySelector('.home-explorer-side'),null,'The map is shown without a site picker.');
assert.strictEqual(homeDom.window.document.querySelector('.home-map-stage img')?.getAttribute('src'),'assets/ban-do-di-san-ha-noi-day-du.png','The map preserves the entire supplied PDF page.');
const homeDocument = homeDom.window.document;
const illustratedWebsites=JSON.parse(fs.readFileSync(path.join(root,'src/illustrated-websites.json'),'utf8'));
for(const [id,name] of Object.entries({
  duc_thanh_tran:'Đền Đức Thánh Trần',
  van_huong:'Đình Văn Hương',
  but_moc:'Chùa Bụt Mọc',
  kham_duc_den:'Đền Khâm Đức thờ Châu Đệ Tứ',
})) {
  const url=new URL(illustratedWebsites[id]);
  assert.strictEqual(url.origin,'https://www.google.com');
  assert.strictEqual(url.pathname,'/maps/search/');
  assert.strictEqual(url.searchParams.get('api'),'1');
  assert(url.searchParams.get('query').startsWith(name),`${name} opens a named Google Maps search.`);
}
assert.strictEqual(homeDocument.querySelectorAll('.home-route-option').length,6,'The homepage offers all six routes.');
const homeR02=[...homeDocument.querySelectorAll('.home-route-option')].find(button=>button.textContent.includes('R02'));
assert(homeR02.textContent.includes('Đình Văn Hương')&&homeR02.textContent.includes('Đình Khâm Đức'),'R02 follows the supplied legend.');
homeR02.click();
await tick();
assert.strictEqual(homeDocument.querySelectorAll('.home-route-stop').length,5,'Selecting R02 highlights its five illustrated stops.');
assert.strictEqual(homeDocument.querySelectorAll('.home-route-stop')[1].getAttribute('href'),illustratedWebsites.van_huong,'Route badges use the matching website from the supplied sheet.');
const routeTransform=homeDocument.querySelector('.home-route-highlight').style.transform;
const transformParts=/translate\(([\d.]+)%,([\d.]+)%\) scale\(([\d.]+),([\d.]+)\)/.exec(routeTransform);
assert(transformParts,'The route line is calibrated to the current illustrated map.');
const [,offsetXPercent,offsetYPercent,scaleX,scaleY]=transformParts.map(Number);
const vanHuongStop=homeDocument.querySelectorAll('.home-route-stop')[1];
assert(Math.abs(389*scaleX+offsetXPercent*768/100-parseFloat(vanHuongStop.style.left)*768/100)<1,'R02 line and Văn Hương stop share the same horizontal calibration.');
assert(Math.abs(317*scaleY+offsetYPercent*1152/100-parseFloat(vanHuongStop.style.top)*1152/100)<1,'R02 line and Văn Hương stop share the same vertical calibration.');
assert.strictEqual(homeDocument.querySelector('.home-map-heading'),null,'The zoom and PDF toolbar is removed.');
assert.strictEqual(homeDocument.querySelector('a[href="assets/di-san-ha-noi-chu-giai.pdf"]'),null,'The PDF link is removed from the homepage.');
assert(homeDocument.querySelector('.home-map-title-art'),'The illustrated title stays inside the map.');
const homeW02=[...homeDocument.querySelectorAll('.home-route-option')].find(button=>button.textContent.includes('W02'));
homeW02.click();
await tick();
for(const [id,x,y] of [['ngoc_ho',554,137],['y_mieu',613,218]]) {
  const stop=homeDocument.querySelector(`.home-route-stop[data-site-id="${id}"]`);
  assert(stop,`W02 includes ${id}.`);
  assert(Math.abs(parseFloat(stop.style.left)*768/100-x)<2,`${id} route marker aligns horizontally with the map.`);
  assert(Math.abs(parseFloat(stop.style.top)*1152/100-y)<2,`${id} route marker aligns vertically with the map.`);
}
homeW02.click();
await tick();
const illustratedStage=homeDocument.querySelector('.home-map-stage');
illustratedStage.getBoundingClientRect=()=>({left:0,top:0,right:768,bottom:1152,width:768,height:1152});
for(const [id,name,x,y] of [
  ['ngoc_ho','Chùa Ngọc Hồ (Bà Ngô)',554,137],
  ['y_mieu','Y Miếu',613,218],
  ['duc_thanh_tran','Đền Đức Thánh Trần',674,254],
  ['tien_tich','Chùa Tiên Tích',679,274],
]) {
  const hotspot=homeDocument.querySelector(`a.home-map-hotspot[data-site-id="${id}"]`);
  assert(hotspot,`Missing hotspot for ${name}`);
  assert(Math.abs(parseFloat(hotspot.style.left)*768/100-x)<2,`${name} horizontal position matches the current map image.`);
  assert(Math.abs(parseFloat(hotspot.style.top)*1152/100-y)<2,`${name} vertical position matches the current map image.`);
  illustratedStage.dispatchEvent(new homeDom.window.MouseEvent('mousemove',{bubbles:true,clientX:x,clientY:y}));
  for(let attempt=0;attempt<50&&homeDocument.querySelector('[role="tooltip"] strong')?.textContent!==name;attempt++) await new Promise(resolve=>setTimeout(resolve,10));
  assert.strictEqual(homeDocument.querySelector('[role="tooltip"] strong')?.textContent,name,`${name} shows its own preview.`);
}
illustratedStage.dispatchEvent(new homeDom.window.MouseEvent('mousemove',{bubbles:true,clientX:603,clientY:245}));
for(let attempt=0;attempt<50&&homeDocument.querySelector('[role="tooltip"] strong')?.textContent!=='Chùa Quang Minh';attempt++) await new Promise(resolve=>setTimeout(resolve,10));
assert.strictEqual(homeDocument.querySelector('[role="tooltip"] strong')?.textContent,'Chùa Quang Minh','Nearby artwork opens a preview outside the tiny hotspot.');
illustratedStage.dispatchEvent(new homeDom.window.MouseEvent('mousemove',{bubbles:true,clientX:517,clientY:131}));
for(let attempt=0;attempt<50&&homeDocument.querySelector('[role="tooltip"] strong')?.textContent!=='Đình Thanh Miến';attempt++) await new Promise(resolve=>setTimeout(resolve,10));
assert.strictEqual(homeDocument.querySelector('[role="tooltip"] strong')?.textContent,'Đình Thanh Miến','The nearest landmark wins in overlapping areas.');
homeDom.window.dispatchEvent(new homeDom.window.KeyboardEvent('keydown',{key:'Escape'}));
await tick();
let lastMapNavigation=null;
homeDocument.addEventListener('click',event=>{
  const link=event.target.closest?.('a.home-map-hotspot,a.home-route-stop');
  if(link){lastMapNavigation=link.getAttribute('href');event.preventDefault();}
},true);
illustratedStage.dispatchEvent(new homeDom.window.MouseEvent('click',{bubbles:true,clientX:603,clientY:245,detail:1}));
await tick();
assert.strictEqual(lastMapNavigation,illustratedWebsites.quang_minh,'The nearby artwork opens the matching external website.');
lastMapNavigation=null;
homeDocument.querySelector('a.home-map-hotspot[data-site-id="ngoc_ho"]').dispatchEvent(new homeDom.window.MouseEvent('click',{bubbles:true,cancelable:true,clientX:517,clientY:131,detail:1}));
await tick();
assert.strictEqual(lastMapNavigation,illustratedWebsites.thanh_mien,'An overlap opens the nearest landmark website rather than the covering link.');
// Every illustrated site retains its own name, supplied photo and matching website.
const suppliedPhotos=JSON.parse(fs.readFileSync(path.join(root,'src/landmark-photos.json'),'utf8'));
for(const hotspot of homeDocument.querySelectorAll('a.home-map-hotspot')) {
  const name=hotspot.getAttribute('aria-label');
  const id=hotspot.dataset.siteId;
  const photoKey=name==='Chùa Tiên Phúc Tự'?'tien_phuc':id;
  const website=illustratedWebsites[photoKey];
  assert.strictEqual(hotspot.getAttribute('href'),website||`#/di-tich/${id}`,`${name} navigates to its matching website or existing detail page.`);
  assert.strictEqual(hotspot.getAttribute('target'),website?'_blank':null,`${name} keeps the map open when visiting an external website.`);
  hotspot.dispatchEvent(new homeDom.window.MouseEvent('mouseover',{bubbles:true}));
  for(let attempt=0;attempt<50&&!homeDocument.querySelector('[role="tooltip"]');attempt++) await new Promise(resolve=>setTimeout(resolve,10));
  const preview=homeDocument.querySelector('[role="tooltip"]');
  assert(preview,`Hover opens the preview for ${name}`);
  assert.strictEqual(preview.querySelector('strong').textContent,name);
  assert.strictEqual(preview.querySelector('img')?.getAttribute('src')||null,suppliedPhotos[photoKey]?.src||null,`The supplied photo matches ${name}.`);
  assert.strictEqual(preview.parentElement,homeDocument.body,'Preview escapes the map scroll container.');
  homeDom.window.dispatchEvent(new homeDom.window.KeyboardEvent('keydown',{key:'Escape'}));
  await tick();
  assert.strictEqual(homeDocument.querySelector('[role="tooltip"]'),null,'Escape dismisses the preview.');
}
for(const [label,key] of [['Chùa Bà Nành','ba_nanh'],['Chùa Tiên Phúc Tự','tien_phuc']]) {
  homeDocument.querySelector(`a.home-map-hotspot[aria-label="${label}"]`).focus();
  await tick();
  assert.strictEqual(homeDocument.querySelector('[role="tooltip"] img').getAttribute('src'),`assets/landmark-photos/${key}.png`,'Shared destination retains the distinct photograph assigned to each illustration.');
}
const noPhoto=homeDocument.querySelector('a.home-map-hotspot[data-site-id="song_son"]');
noPhoto.focus();
await tick();
assert.strictEqual(homeDocument.querySelector('[role="tooltip"] strong').textContent,'Đền Mẫu Sòng Sơn – Hà Nội');
assert.strictEqual(homeDocument.querySelector('[role="tooltip"] img'),null,'Never borrow a photograph from another place.');
const withPhoto=homeDocument.querySelector('a.home-map-hotspot[data-site-id="tien_tich"]');
withPhoto.focus();
await tick();
homeDocument.querySelector('[role="tooltip"] img').dispatchEvent(new homeDom.window.Event('error'));
await tick();
assert.strictEqual(homeDocument.querySelector('[role="tooltip"] img'),null,'An unavailable photo falls back to the name.');
homeDom.window.dispatchEvent(new homeDom.window.Event('scroll'));
await tick();
assert(homeDocument.querySelector('[role="tooltip"]'),'Keyboard preview remains available when the browser scrolls to the focused landmark.');
const hotspotLinks = [...homeDocument.querySelectorAll('.home-map-hotspot')].map(link=>({href:link.getAttribute('href'),name:link.getAttribute('aria-label')}));
assert.strictEqual(hotspotLinks.length,33,'Every named illustration has a link.');
assert.strictEqual(new Set(hotspotLinks.map(link=>link.href)).size,33,'Ba Nanh and Tien Phuc use distinct websites.');
assert.strictEqual(homeDocument.querySelector('.home-map-hotspot[data-site-id="kham_duc_dinh"]').getAttribute('href'),'#/di-tich/kham_duc_dinh','A blank sheet URL retains the existing detail-page destination.');
homeDom.window.location.hash='#/di-tich/van_mieu';
homeDom.window.dispatchEvent(new homeDom.window.HashChangeEvent('hashchange'));
await tick();
assert.strictEqual(homeDocument.querySelector('.site-page h1')?.textContent,'Văn Miếu – Quốc Tử Giám','Existing internal detail pages remain available.');
assert.strictEqual(homeDocument.querySelector('#map'),null,'A landmark page does not mount the GIS map.');
homeDom.window.location.hash='#gioi-thieu';
homeDom.window.dispatchEvent(new homeDom.window.HashChangeEvent('hashchange'));
await tick();
assert.strictEqual(homeDocument.querySelectorAll('.home-map-hotspot').length,33,'Returning restores the illustration links.');
homeDom.window.location.hash='#/di-tich/unknown';
homeDom.window.dispatchEvent(new homeDom.window.HashChangeEvent('hashchange'));
await tick();
assert.strictEqual(homeDocument.querySelector('.site-page h1')?.textContent,'Không tìm thấy di tích');
homeDom.window.close();
console.log('Home checks passed: 6 route choices, 33 illustration links, 32 name-only pages, no map toolbar and no hidden map instance.');
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
