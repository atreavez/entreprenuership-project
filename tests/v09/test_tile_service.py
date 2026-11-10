"""Test-first security and behavior contract for the private-deployment basemap server."""
import base64, json, sqlite3, tempfile, unittest
from pathlib import Path
from services.tiles.tile_service import TileStore, BadTileRequest, UnsupportedTileset

ONE_PX_PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==')

class TileServiceContract(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'demo.mbtiles'
        with sqlite3.connect(self.path) as db:
            db.executescript('CREATE TABLE metadata (name text, value text);CREATE TABLE tiles (zoom_level integer,tile_column integer,tile_row integer,tile_data blob);')
            db.executemany('INSERT INTO metadata VALUES (?,?)',[('format','png'),('minzoom','0'),('maxzoom','5'),('bounds','29.5,-1.5,35.1,4.3')])
            db.execute('INSERT INTO tiles VALUES(?,?,?,?)',(2,2,1,ONE_PX_PNG))
        self.store = TileStore(str(self.path), '© Sample illustration – not a cadastral map')
    def tearDown(self): self.tmp.cleanup()
    def test_xyz_to_tms(self):
        self.assertEqual(self.store.tile(2,2,2), ONE_PX_PNG)  # 2**2 - 1 - 2 == 1
        self.assertIsNone(self.store.tile(2,2,1))
    def test_refuses_invalid_coordinates_and_path_traversal(self):
        for args in [(-1,1,0),(2,-1,0),(2,4,0),(2,0,4),(31,0,0),('2','../../x',0)]:
            with self.subTest(args=args):
                with self.assertRaises(BadTileRequest): self.store.tile(*args)
    def test_styles_do_not_call_external_hosts_or_expose_private_parcels(self):
        style=self.store.style()
        self.assertEqual(style['sources']['basemap']['tiles'],['/maps/tiles/{z}/{x}/{y}.png'])
        self.assertEqual(style['layers'][0]['type'],'background')
        self.assertNotIn('http://',json.dumps(style))
        self.assertNotIn('https://',json.dumps(style))
        self.assertNotIn('parcels',json.dumps(style))
    def test_untrusted_file_bytes_rejected(self):
        with sqlite3.connect(self.path) as db:
            db.execute("UPDATE tiles SET tile_data=?",(b'<script>evil</script>',))
        with self.assertRaises(UnsupportedTileset): self.store.tile(2,2,2)
    def test_vector_mbtiles_require_separate_vector_style(self):
        with sqlite3.connect(self.path) as db: db.execute("UPDATE metadata SET value='pbf' WHERE name='format'")
        with self.assertRaises(UnsupportedTileset): TileStore(str(self.path),'© Sample')
    def test_missing_attribution_must_not_be_silently_omitted(self):
        with self.assertRaises(ValueError): TileStore(str(self.path),'')
    def test_missing_file_does_not_create_empty_db(self):
        with self.assertRaises(FileNotFoundError): TileStore(str(self.path)+'.missing','© Source')
    def test_attribution_is_html_escaped(self):
        safe=TileStore(str(self.path),'<img src=x onerror=alert(1)>')
        self.assertNotIn('<img',json.dumps(safe.style()))

if __name__ == '__main__': unittest.main()
