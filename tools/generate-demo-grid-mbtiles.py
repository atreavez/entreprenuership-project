#!/usr/bin/env python3
"""Generate a visibly watermarked *synthetic* Uganda-area MBTiles tile grid.
No roads/buildings/survey lines and NO claim to governmental accuracy. Requires Pillow.
For an actual map, replace it with properly licensed raster MBTiles.
"""
import io,math,sqlite3
from pathlib import Path
try:from PIL import Image,ImageDraw,ImageFont
except ImportError:raise SystemExit('Pillow is required only to regenerate the demo tiles: python3 -m pip install Pillow')
R=Path(__file__).resolve().parents[1]
DEST=R/'data/maps/uganda-demo.mbtiles';DEST.parent.mkdir(parents=True,exist_ok=True)
if DEST.exists():DEST.unlink()

def xy(lon,lat,z):
 lat=math.radians(lat);scale=2**z
 return int((lon+180)/360*scale),int((1-math.asinh(math.tan(lat))/math.pi)/2*scale)

def make(z,x,y):
 img=Image.new('RGB',(256,256),(13,34,28));d=ImageDraw.Draw(img)
 # A coordinate grid only; looks intentionally schematic and not like a terrain or road map.
 d.rectangle((0,0,255,255),outline=(80,122,81),width=2)
 for i in range(0,256,32):
  d.line([(i,0),(i,256)],fill=(33,66,46),width=1)
  d.line([(0,i),(256,i)],fill=(33,66,46),width=1)
 d.line([(0,0),(256,256)],fill=(62,81,56),width=1)
 d.rectangle((12,12,245,72),fill=(18,38,28),outline=(168,133,56),width=2)
 d.text((23,22),'SAMPLE TILES ONLY',fill=(243,198,97))
 d.text((23,43),'NO REAL BASEMAP DATA',fill=(211,214,183))
 d.text((12,225),f'XYZ {z} / {x} / {y}',fill=(164,207,170))
 b=io.BytesIO();img.save(b,format='PNG',optimize=True);return b.getvalue()

with sqlite3.connect(DEST) as db:
 db.executescript('CREATE TABLE metadata(name TEXT,value TEXT);CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB);CREATE UNIQUE INDEX tile_index ON tiles (zoom_level,tile_column,tile_row);')
 md={'name':'AssetTrust DEMO non-geographic coordinate grid','type':'baselayer','format':'png','minzoom':'5','maxzoom':'13','bounds':'32.25,-0.1,33.0,0.65','description':'INTENTIONALLY SYNTHETIC GRID; no real cartography, roads, legal survey or boundaries.'}
 db.executemany('INSERT INTO metadata VALUES (?,?)',list(md.items()))
 n=0
 for z in range(5,14):
  left,top=xy(32.25,0.65,z);right,bottom=xy(33.0,-0.1,z)
  for x in range(left,right+1):
   for y in range(top,bottom+1):
    db.execute('INSERT INTO tiles VALUES(?,?,?,?)',(z,x,2**z-1-y,make(z,x,y)));n+=1
print(f'Created {DEST} with {n} *synthetic* raster tiles for offline pipeline checks. NOT geographic data.')
