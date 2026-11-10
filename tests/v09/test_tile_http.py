"""A real loopback HTTP test, without third-party services or a running NestJS app."""
import base64, json, sqlite3, tempfile, threading, unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen
from services.tiles.tile_service import TileStore,handler_for
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==')
class TileHttpTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'t.mbtiles'
  with sqlite3.connect(self.path) as db:
   db.executescript('CREATE TABLE metadata(name text,value text); CREATE TABLE tiles(zoom_level integer,tile_column integer,tile_row integer,tile_data blob);')
   db.executemany('INSERT INTO metadata VALUES(?,?)',[('format','png'),('minzoom','0'),('maxzoom','3')]);db.execute('INSERT INTO tiles VALUES(0,0,0,?)',(PNG,))
  self.server=ThreadingHTTPServer(('127.0.0.1',0),handler_for(TileStore(str(self.path),'© Test publisher')))
  self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
  self.url='http://127.0.0.1:'+str(self.server.server_address[1])
 def tearDown(self):self.server.shutdown();self.server.server_close();self.tmp.cleanup()
 def get(self,path):return urlopen(self.url+path,timeout=3)
 def test_tile_and_style_roundtrip(self):
  with self.get('/maps/style.json') as r:
   data=json.load(r)
   self.assertEqual(r.status,200)
   self.assertIn('/maps/tiles/{z}/{x}/{y}.png',data['sources']['basemap']['tiles'])
   self.assertEqual(r.headers.get('Cache-Control'),'no-store')
  with self.get('/maps/tiles/0/0/0.png') as r:
   self.assertEqual(r.headers.get('Content-Type'),'image/png')
   self.assertEqual(r.headers.get('X-Content-Type-Options'),'nosniff')
   self.assertEqual(r.read(),PNG)
 def test_other_paths_cannot_disclose_server_files(self):
  for path in ['/','/maps/private-docs','/maps/tiles/2/500/0.png','/maps/tiles/999999999999999999999/0/0.png','/maps/tiles/../../test','/api/v1/geo/parcels']:
   with self.subTest(path=path):
    with self.assertRaises(HTTPError) as cm:self.get(path)
    self.assertIn(cm.exception.code,(400,404))
if __name__=='__main__':unittest.main()
