"""Loopback-only browser QA server. Fault injection never changes production files.

Open /?qa=no-webgl, no-library, style-error, tile-error, raster-error.
Use normal / to verify recovery. All responses disable caching for repeatable QA.
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
import json

ROOT = Path(__file__).resolve().parents[1]

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)

    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()

    def send_body(self,text,kind='text/html',status=200):
        body=text.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type',kind+'; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url=urlsplit(self.path)
        scenario=parse_qs(url.query).get('qa',[''])[0]
        if url.path.startswith('/__blocked__/'):
            self.send_body('Intentional QA outage','text/plain',503)
            return
        if url.path=='/' and scenario:
            html=(ROOT/'index.html').read_text(encoding='utf-8')
            html=html.replace('src="map-engine.js"',f'src="map-engine.js?qa={scenario}"')
            if scenario=='no-library':
                html=html.replace('<script src="vendor/maplibre-gl.js"></script>','')
            if scenario=='no-webgl':
                script="""<script>const originalGetContext=HTMLCanvasElement.prototype.getContext;
                HTMLCanvasElement.prototype.getContext=function(type,...args){
                return /webgl/.test(type)?null:originalGetContext.call(this,type,...args);};</script>"""
                html=html.replace('<head>','<head>'+script)
            self.send_body(html)
            return
        if url.path=='/map-engine.js' and scenario:
            text=(ROOT/'map-engine.js').read_text(encoding='utf-8')
            if scenario in ('style-error','tile-error'):
                text=text.replace("'map-style.json'",f"'map-style.json?qa={scenario}'")
            if scenario=='raster-error':
                text=text.replace("if (!window.maplibregl)","if (true)")
                text=text.replace('https://tile.openstreetmap.org','/__blocked__/osm')
                text=text.replace('https://tile.openstreetmap.de','/__blocked__/osmde')
            self.send_body(text,'text/javascript')
            return
        if url.path=='/map-style.json' and scenario:
            if scenario=='style-error':
                self.send_body('Intentional style outage','text/plain',503)
                return
            style=json.loads((ROOT/'map-style.json').read_text(encoding='utf-8'))
            if scenario=='tile-error':
                style['sources']['openmaptiles']={'type':'vector','tiles':['http://localhost:8766/__blocked__/{z}/{x}/{y}.pbf'],'minzoom':0,'maxzoom':14}
            self.send_body(json.dumps(style),'application/json')
            return
        super().do_GET()

print('Browser QA: http://localhost:8766 (loopback only)',flush=True)
ThreadingHTTPServer(('localhost',8766),Handler).serve_forever()
