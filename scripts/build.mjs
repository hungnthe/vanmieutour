import {build} from 'esbuild';

await build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'iife',
  target: ['es2020'],
  jsx: 'automatic',
  outfile: 'app.bundle.js',
  logLevel: 'info'
});
