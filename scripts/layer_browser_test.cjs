const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'artifacts', 'layer-audit');
  fs.mkdirSync(out, {recursive: true});
  const browser = await chromium.launch({channel:'chrome', headless:true, args:['--enable-webgl','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
  const errors = [];
  const captures = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://localhost:8766/', async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace('<script src="app.js"></script>',
      '<script>const start=HeritageMap.prototype.start;HeritageMap.prototype.start=function(...args){window.__layerAuditMap=this;return start.apply(this,args)};</script><script src="app.js"></script>');
    await route.fulfill({response,body:html});
  });
  await page.goto('http://localhost:8766/', {waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#map-key').evaluate(element => {element.open = true;});
  await page.waitForSelector('#map[data-ready="true"]', {timeout:90000});
  await page.waitForSelector('#map[data-gis-ready="true"]', {timeout:30000});
  await page.waitForTimeout(1800);

  const toggle = async (selector, enabled) => {
    await page.locator(selector).evaluate((input, checked) => {
      if (input.checked === checked) return;
      input.checked = checked;
      input.dispatchEvent(new Event('change', {bubbles:true}));
    }, enabled);
    await page.waitForTimeout(500);
  };
  const capture = async (name) => {
    await page.waitForTimeout(900);
    await page.screenshot({path:path.join(out, `${name}.png`), animations:'disabled'});
    captures.push(await page.evaluate(name => {
      const engine = window.__layerAuditMap;
      const map = engine?.map;
      const ids = ['gis-roads','gis-water-fill','gis-railways_area','gis-railways_context','gis-boundary','gis-boundary_supplementary'];
      const gis = Object.fromEntries(ids.map(id => [id, map?.getLayer(id) ? {
        visibility:map.getLayoutProperty(id,'visibility') || 'visible',
        rendered:map.queryRenderedFeatures({layers:[id]}).length
      } : {visibility:'missing',rendered:0}]));
      const osm3d = map?.getLayer('building-3d') ? {
        visibility:map.getLayoutProperty('building-3d','visibility') || 'visible',
        rendered:map.queryRenderedFeatures({layers:['building-3d']}).length
      } : {visibility:'missing',rendered:0};
      const sketchupGroups = Object.fromEntries(['TPX_BUILDINGS','noithat','nha_khoi','timngo','TPX_ROADS_HATCH','TPX_WATERWAYS_HATCH','TPX_TERRAIN_TERRAIN_MESH','TPX_VEGETATION_GREEN_SPACES_HATCH'].map(id => {
        const object = engine?.modelLayer?.scene.getObjectByName(id);
        return [id,object ? object.visible : null];
      }));
      return {name,renderer:engine?.kind,model:engine?.modelState,base:engine?.baseVisible,osm3d,
        sketchup:engine?.modelLayer?.visible || false,sketchupGroups,gis,
        markers:[...(engine?.markers?.values() || [])].filter(({element})=>element.style.display !== 'none').length};
    },name));
  };
  const allGIS = async (enabled) => {
    for (const id of ['layer-gis-roads','layer-gis-water','layer-gis-railways','layer-gis-boundaries']) await toggle(`#${id}`,enabled);
  };
  const resetNonTarget = async () => {
    await toggle('#layer-osm-buildings',false);
    await toggle('#layer-sketchup',false);
    await allGIS(false);
    await toggle('#layer-markers',false);
  };

  await resetNonTarget();
  await toggle('#layer-osm-base',true);
  await capture('01-osm-base');

  await toggle('#layer-osm-base',false);
  await toggle('#layer-gis-roads',true);
  await capture('02-gis-roads');
  await toggle('#layer-gis-roads',false);
  await toggle('#layer-gis-water',true);
  await capture('03-gis-water');
  await toggle('#layer-gis-water',false);
  await toggle('#layer-gis-railways',true);
  await capture('04-gis-railways');
  await toggle('#layer-gis-railways',false);
  await toggle('#layer-gis-boundaries',true);
  await capture('05-gis-boundaries');

  await toggle('#layer-gis-boundaries',false);
  await toggle('#layer-osm-base',true);
  await toggle('#layer-osm-buildings',true);
  await page.evaluate(() => window.__layerAuditMap.map.setZoom(16));
  await page.waitForTimeout(1600);
  await capture('06-osm-3d-buildings');
  await toggle('#layer-osm-buildings',false);
  await page.locator('#map-reset').click();
  await page.waitForTimeout(1000);

  await toggle('#layer-osm-base',false);
  await toggle('#layer-markers',true);
  await capture('07-heritage-markers');
  await toggle('#layer-markers',false);

  await page.locator('#map-model').click();
  await page.waitForFunction(() => document.querySelector('#map').dataset.model === 'ready', {timeout:90000});
  await page.waitForTimeout(1800);
  await capture('08-sketchup-model-default-sublayers');

  const sketchupGroups = [
    ['layer-sketchup-buildings','09-sketchup-buildings'],
    ['layer-sketchup-details','10-sketchup-interiors'],
    ['layer-sketchup-blocks','11-sketchup-building-blocks'],
    ['layer-sketchup-annotations','12-sketchup-labels-and-guides'],
    ['layer-sketchup-roads','13-sketchup-road-hatch'],
    ['layer-sketchup-water','14-sketchup-water-hatch'],
    ['layer-sketchup-terrain','15-sketchup-terrain-white-base'],
    ['layer-sketchup-green','16-sketchup-green-spaces']
  ];
  for (const [id,name] of sketchupGroups) {
    for (const [other] of sketchupGroups) await toggle(`#${other}`, other === id);
    await capture(name);
  }

  for (const [id] of sketchupGroups) await toggle(`#${id}`, ['layer-sketchup-buildings','layer-sketchup-details','layer-sketchup-blocks','layer-sketchup-annotations'].includes(id));
  await toggle('#layer-sketchup',false);
  await page.locator('#map-reset').click();
  await page.waitForTimeout(1000);
  await toggle('#layer-osm-base',false);
  await allGIS(true);
  await toggle('#layer-markers',true);
  await capture('17-composite-gis-overlays-and-markers');

  await allGIS(true);
  await toggle('#layer-markers',false);
  await toggle('#layer-osm-base',true);
  await toggle('#layer-osm-buildings',false);
  await capture('18-osm-and-gis-overlap-check');
  await allGIS(false);
  await toggle('#layer-markers',true);
  await capture('19-final-safe-osm-composite');
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(600);
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Layer controls overflow the mobile viewport');
  if (await page.locator('[data-map-base],[data-map-buildings],[data-map-sketchup],[data-map-markers],[data-gis-group],[data-sketchup-layer]').count() !== 16) throw new Error('Mobile viewport is missing an independent layer control');
  await capture('20-mobile-layer-controls');

  const report = {
    url:page.url(), viewport:page.viewportSize(), screenshots:fs.readdirSync(out).filter(name => name.endsWith('.png')).sort(),
    defaultLayerState:{osmBase:true,gisOverlays:false,osmBuildings:false,sketchup:false,markers:true},
    sketchupLayerState:{renderer:await page.locator('#map').getAttribute('data-renderer'),model:await page.locator('#map').getAttribute('data-model'),buildings:await page.locator('#map').getAttribute('data-buildings')},
    captures,pageErrors:errors
  };
  const osmBuildingCapture = captures.find(capture => capture.name === '06-osm-3d-buildings');
  if (osmBuildingCapture?.osm3d.rendered < 1 || osmBuildingCapture.sketchup) throw new Error('OSM 3D isolation screenshot did not show an exclusive OSM building layer');
  if (captures.some(capture => capture.sketchup && capture.osm3d.visibility === 'visible')) throw new Error('OSM and SketchUp 3D building layers were visible together');
  const initial = captures.find(capture => capture.name === '01-osm-base');
  if (!initial?.base || initial.osm3d.visibility !== 'none' || initial.sketchup || Object.values(initial.gis).some(layer=>layer.visibility !== 'none')) throw new Error('Default layer visibility is not the safe OSM-only state');
  if (captures.find(capture => capture.name === '07-heritage-markers')?.markers !== 25) throw new Error('Marker-only screenshot did not include 25 located heritage sites');
  const terrain = captures.find(capture => capture.name === '15-sketchup-terrain-white-base');
  if (!terrain?.sketchup || terrain.sketchupGroups.TPX_TERRAIN_TERRAIN_MESH !== true) throw new Error('Terrain isolation screenshot did not show the extracted white base layer');
  const gisComposite = captures.find(capture => capture.name === '17-composite-gis-overlays-and-markers');
  if (!gisComposite || gisComposite.gis['gis-roads'].rendered < 1 || gisComposite.gis['gis-water-fill'].rendered < 1 || gisComposite.gis['gis-railways_area'].rendered < 1 || gisComposite.markers !== 25) throw new Error('GIS composite screenshot is missing an enabled layer');
  fs.writeFileSync(path.join(out,'results.json'), JSON.stringify(report,null,2));
  await browser.close();
  if (errors.length) process.exitCode = 1;
  console.log(JSON.stringify(report,null,2));
})().catch(error => {console.error(error);process.exit(1);});

