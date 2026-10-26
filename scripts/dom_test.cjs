const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname,'..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const dom = new JSDOM(html, {runScripts:'outside-only',url:'http://localhost:8765/',pretendToBeVisual:true});
const {window} = dom;
const {document} = window;
window.ResizeObserver = class { observe() {} disconnect() {} };
window.HTMLCanvasElement.prototype.getContext = () => null;

window.eval(fs.readFileSync(path.join(root,'data.js'),'utf8'));
window.eval(fs.readFileSync(path.join(root,'map-engine.js'),'utf8'));
window.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));

const click = selector => {
  const item = document.querySelector(selector);
  assert(item,`Missing element: ${selector}`);
  item.click();
};
const $count = selector => document.querySelectorAll(selector).length;

assert.strictEqual($count('.route-card'),6);
assert.strictEqual($count('.site-row'),32);
assert.strictEqual($count('[data-gis-group]'),4,'GIS overlays are independently grouped by roads, water, rail and boundaries');
assert.strictEqual($count('[data-sketchup-layer]'),8,'SketchUp building, detail, hatch and terrain sublayers have independent controls');
assert.strictEqual($count('[data-gis-layer="heritage_points_review"]'),0,'Unverified candidate points are not exposed in the public map UI');
assert.strictEqual(document.querySelector('[data-map-base]').checked,true,'OSM is the default base layer');
assert.strictEqual(document.querySelector('[data-map-sketchup]').checked,false,'Unverified SketchUp placement is disabled by default');
assert.strictEqual(document.querySelector('[data-map-buildings]').checked,false,'OSM 3D buildings are off until selected');
assert([...document.querySelectorAll('[data-gis-group]')].every(input=>!input.checked),'GIS overlays do not duplicate OSM by default');
assert.strictEqual(document.querySelector('#metric-geocoded').textContent,'25');
assert.strictEqual($count('.map-marker'),0, 'No fake pins without a map provider');
assert.strictEqual(document.querySelector('#map-failure').hidden,false);

click('[data-route="W02"]');
assert.strictEqual(document.querySelector('[data-route="W02"]').getAttribute('aria-pressed'),'true');
assert(document.querySelector('#floating-route').textContent.includes('Chùa Ngọc Hồ'));
assert.strictEqual($count('.site-row.dim'),29);

click('#tab-motorbike');
assert.strictEqual($count('.route-card'),3);
click('[data-route="R03"]');
assert(document.querySelector('#floating-route').textContent.includes('1 điểm chưa có tọa độ'));

document.querySelector('#site-search').value='Khâm Đức';
document.querySelector('#site-search').dispatchEvent(new window.Event('input',{bubbles:true}));
assert.strictEqual($count('.site-row'),2);
click('[data-site="kham_duc_dinh"]');
assert(document.querySelector('.detail-status-title').textContent.includes('Chưa đủ tọa độ'));
assert(document.querySelector('.detail-title').textContent.includes('Khâm Đức'));
assert.strictEqual(document.querySelector('#details').classList.contains('open'),true);
// Accent-insensitive search and stop order are user-facing behavior.
document.querySelector('#site-search').value='kham duc';
document.querySelector('#site-search').dispatchEvent(new window.Event('input',{bubbles:true}));
assert.strictEqual($count('.site-row'),2);
click('#tab-walk');
assert.strictEqual(document.querySelector('#floating-route').hidden,true,'Changing mode clears a route from the other group');
click('#route-list [data-route="W02"]');
assert.deepStrictEqual([...document.querySelectorAll('.route-stops [data-site]')].map(e=>e.dataset.site),['van_mieu','ngoc_ho','y_mieu']);
click('.route-stops [data-site="y_mieu"]');
assert.strictEqual(document.querySelector('.detail-title').textContent,'Y Miếu');

document.querySelector('#site-search').value='';
document.querySelector('#site-search').dispatchEvent(new window.Event('input',{bubbles:true}));
click('[data-reset-route]');
assert.strictEqual($count('.route-card'),6);
assert.strictEqual($count('.site-row.dim'),0);
assert.strictEqual(window.HERITAGE_DATA.routes.length,6);
assert.strictEqual(window.HERITAGE_DATA.sites.filter(s => s.lat === null).length,7);
assert.strictEqual(window.HERITAGE_DATA.sites.filter(s => s.lat !== null).length,25);

console.log('DOM checks passed: 32 sites, 25 coordinates, 6 routes, categories, click details, searching and R03 missing stop.');
dom.window.close();
