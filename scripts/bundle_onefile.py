"""Create a convenient single-file HTML release of the review prototype."""

from pathlib import Path
from urllib.parse import quote
import json
import base64
import os
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "index.html").read_text(encoding="utf-8")
css = (ROOT / "styles.css").read_text(encoding="utf-8")
home_css = (ROOT / "home.css").read_text(encoding="utf-8")
data = (ROOT / "data.js").read_text(encoding="utf-8")
subprocess.run(["npm.cmd" if os.name == "nt" else "npm", "run", "build"], cwd=ROOT, check=True)
app = (ROOT / "app.bundle.js").read_text(encoding="utf-8")
engine = (ROOT / "map-engine.js").read_text(encoding="utf-8")
gis_engine = (ROOT / "gis-layers.js").read_text(encoding="utf-8")
style = (ROOT / "map-style.json").read_text(encoding="utf-8")
worker = (ROOT / "vendor" / "maplibre-gl-worker.js").read_text(encoding="utf-8")

gis_dir = ROOT / "data" / "gis"
gis_manifest_path = gis_dir / "manifest.json"
if not gis_manifest_path.is_file():
    raise SystemExit("GIS layers are missing. Run scripts/gis/build_layers.py before bundling.")
gis_manifest = json.loads(gis_manifest_path.read_text(encoding="utf-8"))
gis_layers = {}
for layer_id in gis_manifest.get("map_layer_ids", []):
    layer_info = gis_manifest["layers"][layer_id]
    layer_path = gis_dir / layer_info["output_file"]
    if not layer_path.is_file():
        raise SystemExit(f"Generated GIS layer is missing: {layer_path}")
    gis_layers[layer_id] = json.loads(layer_path.read_text(encoding="utf-8"))
def script(text):
    return '<script>\n' + text.replace('</script', '<\\/script') + '\n</script>'

for name in ['maplibre-gl', 'leaflet']:
    vendor_css = (ROOT / 'vendor' / f'{name}.css').read_text(encoding='utf-8')
    html = html.replace(f'<link rel="stylesheet" href="vendor/{name}.css">',f'<style>\n{vendor_css}\n</style>')
    vendor_js = (ROOT / 'vendor' / f'{name}.js').read_text(encoding='utf-8')
    html = html.replace(f'<script src="vendor/{name}.js"></script>',script(vendor_js))
model_dir = ROOT / 'data' / 'model'
model_config = json.loads((model_dir / 'manifest.json').read_text(encoding='utf-8'))
campus_scene = json.loads((model_dir / 'campus-scene.json').read_text(encoding='utf-8'))
model_inline = 'window.HERITAGE_SKETCHUP_DATA=' + json.dumps({
    'config': model_config,
    'campus': campus_scene,
    'glb': base64.b64encode((ROOT / campus_scene['url']).read_bytes()).decode('ascii')
},separators=(',',':')) + ';'
html = html.replace('<script src="vendor/sketchup-model.js"></script>',script(model_inline)+'\n'+script((ROOT/'vendor/sketchup-model.js').read_text(encoding='utf-8')))
config = f'window.HERITAGE_MAP_STYLE={style};\nwindow.HERITAGE_WORKER_URL=URL.createObjectURL(new Blob([{json.dumps(worker)}],{{type:"text/javascript"}}));'
html = html.replace('<script src="data.js?v=20261029-gis-points"></script>',script(config)+'\n<script src="data.js?v=20261029-gis-points"></script>')
html = re.sub(r'<link rel="stylesheet" href="styles\.css(?:\?[^"]*)?">', lambda _: f'<style>\n{css}\n</style>', html, count=1)
html = re.sub(r'<link rel="stylesheet" href="home\.css(?:\?[^"]*)?">', lambda _: f'<style>\n{home_css}\n</style>', html, count=1)
html = html.replace('<script src="data.js?v=20261029-gis-points"></script>', f'<script>\n{data}\n</script>')
html = re.sub(r'<script src="app\.bundle\.js(?:\?[^\"]*)?"></script>', lambda _: f'<script>\n{app}\n</script>', html, count=1)
html = re.sub(r'<script src="map-engine\.js(?:\?[^\"]*)?"></script>', lambda _: script(engine), html, count=1)
gis_bundle = {"manifest":gis_manifest,"layers":gis_layers}
gis_inline = f"window.HERITAGE_GIS_DATA={json.dumps(gis_bundle,ensure_ascii=False,separators=(',',':'))};"
html = html.replace('<script src="gis-layers.js"></script>',script(gis_inline)+"\n"+script(gis_engine))
csv_data = (ROOT / "data" / "site-audit.csv").read_text(encoding="utf-8-sig")
csv_url = 'data:text/csv;charset=utf-8,' + quote('\ufeff' + csv_data, safe='')
html = html.replace('href="data/site-audit.csv"', f'href="{csv_url}"')
hero_data = base64.b64encode((ROOT / "assets" / "van-mieu-home-hero.webp").read_bytes()).decode("ascii")
html = html.replace('assets/van-mieu-home-hero.webp', f'data:image/webp;base64,{hero_data}')
for filename, mime in [('ban-do-di-san-ha-noi-day-du.png', 'image/png'), ('map-title-37-di-tich.png', 'image/png'), ('brand-vm-stamp.png', 'image/png'), ('van-mieu-ticket-logo-vertical.png', 'image/png'), ('postage-stamp-background.png', 'image/png'), ('di-san-ha-noi-chu-giai.pdf', 'application/pdf')]:
    asset_data = base64.b64encode((ROOT / "assets" / filename).read_bytes()).decode("ascii")
    html = html.replace(f'assets/{filename}', f'data:{mime};base64,{asset_data}')
for photo in json.loads((ROOT / 'src' / 'landmark-photos.json').read_text(encoding='utf-8')).values():
    photo_data = base64.b64encode((ROOT / photo['src']).read_bytes()).decode('ascii')
    html = html.replace(photo['src'], f'data:image/png;base64,{photo_data}')
(ROOT / "heritage-atlas-2_5d.html").write_text(html,encoding="utf-8")
print("Built",ROOT / "heritage-atlas-2_5d.html")
