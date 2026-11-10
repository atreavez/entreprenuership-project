"""AssetTrust v0.9 — locally hosted, *public basemap only* MBTiles raster service.

Python standard library, read-only SQLite; no private AssetTrust geometry is served.
Use a properly licensed MBTiles raster tileset with credited attribution.
Does NOT import government cadastral data or verify ownership.
"""
from __future__ import annotations
import html
import hmac
from hashlib import sha256
from contextlib import closing
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import sqlite3
from urllib.parse import quote, urlsplit

class BadTileRequest(ValueError): pass
class UnsupportedTileset(ValueError): pass

class TileStore:
    def __init__(self, mbtiles_path: str, attribution: str, *, require_manifest: bool = False, require_real: bool = False):
        self.path = Path(mbtiles_path).expanduser().resolve(strict=True)
        if not self.path.is_file(): raise FileNotFoundError(mbtiles_path)
        if not isinstance(attribution,str) or not attribution.strip(): raise ValueError('ASSETTRUST_MAP_ATTRIBUTION is required: credit the licensed data producer.')
        self.attribution = html.escape(attribution.strip(), quote=True)
        with closing(self._conn()) as db:
            data = dict(db.execute('SELECT name, value FROM metadata').fetchall())
        self.format = data.get('format','').lower()
        if self.format not in ('png','jpg','jpeg','webp'):
            raise UnsupportedTileset('Raster MBTiles (png/jpeg/webp) required. Vector PBF needs an appropriate vector renderer/style.')
        self.mime = {'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','webp':'image/webp'}[self.format]
        self.minzoom = int(data.get('minzoom','0'))
        self.maxzoom = int(data.get('maxzoom','18'))
        if not (0 <= self.minzoom <= self.maxzoom <= 22): raise ValueError('Invalid zoom metadata')
        rawbounds = [float(p) for p in data.get('bounds','-180,-85,180,85').split(',')]
        if len(rawbounds)!=4 or not (-180 <= rawbounds[0]<rawbounds[2]<=180 and -85.051129<=rawbounds[1]<rawbounds[3]<=85.051129):
            raise ValueError('Invalid tile bounds')
        self.bounds=rawbounds
        if require_manifest or require_real:
            self._check_manifest(attribution.strip(), require_real)

    def _check_manifest(self, attribution: str, require_real: bool):
        manifest_path = self.path.with_suffix('.manifest.json')
        if not manifest_path.is_file() or manifest_path.is_symlink():
            raise ValueError('Verified map manifest required; import the licensed raster dataset first')
        data = json.loads(manifest_path.read_text(encoding='utf-8'))
        expected = data.get('sha256')
        if not isinstance(expected,str) or len(expected)!=64:
            raise ValueError('Missing SHA-256 map fingerprint in manifest')
        h = sha256()
        with self.path.open('rb') as file:
            while block := file.read(4 * 1024 * 1024):
                h.update(block)
        if not hmac.compare_digest(h.hexdigest(),expected):
            raise ValueError('Map checksum fingerprint mismatch')
        if data.get('attribution')!=attribution:
            raise ValueError('Map attribution does not match the import manifest')
        if data.get('format')!=self.format:
            raise ValueError('Map format and manifest disagree')
        if require_real and data.get('classification')!='REAL_GEOGRAPHY':
            raise ValueError('Production basemap must be declared real geographic data; synthetic tiles prohibited')

    def _conn(self):
        # Open read-only: never create or mutate the uploaded/offline MBTiles archive.
        return sqlite3.connect('file:'+quote(str(self.path))+'?mode=ro',uri=True,timeout=2.0)

    def tile(self,z:int,x:int,y:int)->bytes|None:
        if any(type(n) is not int for n in (z,x,y)) or z<0 or z>22 or x<0 or y<0 or x>=2**z or y>=2**z:
            raise BadTileRequest('Invalid XYZ tile coordinates')
        if z<self.minzoom or z>self.maxzoom: return None
        with closing(self._conn()) as db:
            row=db.execute('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=? LIMIT 1',
                           (z,x,2**z-1-y)).fetchone()
        if not row:return None
        blob=row[0]
        if not isinstance(blob,bytes) or len(blob)>4*1024*1024: raise UnsupportedTileset('Tile exceeds size limit or is not binary')
        valid= (blob.startswith(b'\x89PNG\r\n\x1a\n') if self.format=='png'
               else blob.startswith(b'\xff\xd8\xff') if self.format in ('jpg','jpeg')
               else blob.startswith(b'RIFF') and blob[8:12]==b'WEBP')
        if not valid: raise UnsupportedTileset('Tile encoding does not match allowed raster format')
        return blob

    def style(self)->dict:
        # No sprites, glyphs, hosted assets or other outbound URL requests.
        return {'version':8,'name':'AssetTrust locally hosted raster basemap',
                'metadata':{'assettrust:data-class':'licensed-public-basemap-only','assettrust:disclaimer':'Not cadastral or ownership evidence'},
                'sources':{'basemap':{'type':'raster','tiles':['/maps/tiles/{z}/{x}/{y}.png'],
                                       'tileSize':256,'minzoom':self.minzoom,'maxzoom':self.maxzoom,
                                       'attribution':self.attribution,'bounds':self.bounds}},
                'layers':[{'id':'base-background','type':'background','paint':{'background-color':'#0c1c18'}},
                          {'id':'public-basemap','type':'raster','source':'basemap','paint':{'raster-opacity':1}}]}


def handler_for(store:TileStore):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path=urlsplit(self.path).path
            if path=='/maps/healthz':
                return self.reply(200,'application/json',json.dumps({'ok':True,'kind':'licensed-public-raster-basemap','maxzoom':store.maxzoom}).encode(),False)
            if path=='/maps/style.json':return self.reply(200,'application/json',json.dumps(store.style(),separators=(',',':')).encode(),False)
            match=re.fullmatch(r'/maps/tiles/(\d+)/(\d+)/(\d+)\.png',path)
            if match:
                if any(len(part)>6 for part in match.groups()):return self.reply(400,'text/plain',b'Invalid tile coordinates',False)
                try: data=store.tile(*(int(v) for v in match.groups()))
                except BadTileRequest:return self.reply(400,'text/plain',b'Invalid tile coordinates',False)
                except UnsupportedTileset:return self.reply(422,'text/plain',b'Corrupted or unsupported tile',False)
                return self.reply(200,store.mime,data,True) if data is not None else self.reply(404,'text/plain',b'Tile not available',False)
            return self.reply(404,'text/plain',b'Not found',False)
        def reply(self,status:int,mime:str,payload:bytes,cache:bool):
            self.send_response(status)
            self.send_header('Content-Type',mime)
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Referrer-Policy','no-referrer')
            self.send_header('Cache-Control','public, max-age=86400' if cache else 'no-store')
            self.send_header('Content-Length',str(len(payload)))
            self.end_headers();self.wfile.write(payload)
    return Handler

def main():
    mbtiles=os.environ.get('ASSETTRUST_MBTILES_PATH','')
    if not mbtiles:raise SystemExit('ASSETTRUST_MBTILES_PATH must point to a licensed raster .mbtiles file')
    store=TileStore(mbtiles,os.environ.get('ASSETTRUST_MAP_ATTRIBUTION',''),
        require_manifest=os.environ.get('ASSETTRUST_MAP_REQUIRE_MANIFEST','false').lower()=='true',
        require_real=os.environ.get('ASSETTRUST_MAP_PRODUCTION_DATA','false').lower()=='true')
    host=os.environ.get('ASSETTRUST_TILE_HOST','127.0.0.1')
    port=int(os.environ.get('ASSETTRUST_TILE_PORT','8081'))
    print(f'AssetTrust public raster map tiles listening on http://{host}:{port}/maps/style.json; private geometry stays in the API',flush=True)
    ThreadingHTTPServer((host,port),handler_for(store)).serve_forever()

if __name__=='__main__':main()
