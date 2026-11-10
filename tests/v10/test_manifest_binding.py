import importlib.util
from pathlib import Path
import json
import shutil
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('map_provision_v10',ROOT/'tools/provision-raster-basemap-v10.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
from services.tiles.tile_service import TileStore

class ManifestBindingTests(unittest.TestCase):
 def setUp(self):
  temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
  directory=Path(temp.name)
  self.source=directory/'synthetic.mbtiles'
  shutil.copyfile(ROOT/'data/maps/uganda-demo.mbtiles',self.source)
  self.output=directory/'hosted.mbtiles'
  self.attribution='© OpenStreetMap contributors'
  mod.provision(self.source,self.output,source_url='https://example.org/licensed-archive',license_id='ODbL-1.0',license_url='https://www.openstreetmap.org/copyright',attribution=self.attribution,dataset_kind='SYNTHETIC_TEST_ONLY')
 def test_server_accepts_imported_data_when_manifest_required(self):
  store=TileStore(str(self.output),self.attribution,require_manifest=True)
  self.assertGreaterEqual(store.maxzoom,0)
 def test_server_refuses_hash_mismatch(self):
  with self.output.open('ab') as out:out.write(b'changed archive')
  with self.assertRaisesRegex(ValueError,'checksum|hash|fingerprint'):
   TileStore(str(self.output),self.attribution,require_manifest=True)
 def test_server_refuses_synthetic_as_production_data(self):
  with self.assertRaisesRegex(ValueError,'real geographic|synthetic|production'):
   TileStore(str(self.output),self.attribution,require_manifest=True,require_real=True)
 def test_server_requires_manifest_and_matching_attribution(self):
  with self.assertRaisesRegex(ValueError,'attribution'):
   TileStore(str(self.output),'Incorrect attribution',require_manifest=True)
  self.output.with_suffix('.manifest.json').unlink()
  with self.assertRaisesRegex(ValueError,'manifest'):
   TileStore(str(self.output),self.attribution,require_manifest=True)

if __name__=='__main__':unittest.main()
