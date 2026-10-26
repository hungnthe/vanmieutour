// Reproducible local browser dependencies. No CDN is needed at runtime.
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'vendor');
fs.mkdirSync(output, {recursive:true});
esbuild.buildSync({
  stdin: {contents: `import * as maplibre from 'maplibre-gl';
    maplibre.setWorkerUrl(window.HERITAGE_WORKER_URL || new URL('maplibre-gl-worker.js', document.currentScript.src).href);
    window.maplibregl = maplibre;`, resolveDir:root},
  bundle:true, format:'iife', minify:true, target:'es2022',
  define:{'import.meta.url':'document.currentScript.src'},
  outfile:path.join(output, 'maplibre-gl.js'), legalComments:'eof'
});
// Bundle the module worker as .js: Python on Windows may serve .mjs as text/plain.
esbuild.buildSync({entryPoints:[path.join(root,'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs')],
  bundle:true,format:'esm',minify:true,target:'es2022',
  outfile:path.join(output,'maplibre-gl-worker.js'),legalComments:'eof'});
for (const file of ['maplibre-gl.css']) {
  fs.copyFileSync(path.join(root,'node_modules/maplibre-gl/dist',file), path.join(output,file));
}
fs.copyFileSync(path.join(root,'node_modules/maplibre-gl/LICENSE.txt'),path.join(output,'MAPLIBRE-LICENSE.txt'));
for (const file of ['leaflet.js','leaflet.css']) {
  fs.copyFileSync(path.join(root,'node_modules/leaflet/dist',file),path.join(output,file));
}
fs.cpSync(path.join(root,'node_modules/leaflet/dist/images'),path.join(output,'images'),{recursive:true});
fs.copyFileSync(path.join(root,'node_modules/leaflet/LICENSE'),path.join(output,'LEAFLET-LICENSE.txt'));
console.log('Vendored MapLibre 6.15.0 + module worker and Leaflet 1.9.4.');
esbuild.buildSync({entryPoints:[path.join(root,'scripts/sketchup-layer.mjs')],
  bundle:true,format:'iife',minify:true,target:'es2022',
  outfile:path.join(output,'sketchup-model.js'),legalComments:'eof'});
fs.copyFileSync(path.join(root,'node_modules/three/LICENSE'),path.join(output,'THREE-LICENSE.txt'));
