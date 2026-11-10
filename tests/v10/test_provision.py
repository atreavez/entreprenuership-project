import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
SCRIPT=ROOT/'tools/provision-raster-basemap-v10.py'
spec=importlib.util.spec_from_file_location('map_provision_v10',SCRIPT)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
EXAMPLE=ROOT/'data/maps/uganda-demo.mbtiles'
ARGS=dict(source_url='https://download.geofabrik.de/africa/uganda.html',license_id='ODbL-1.0',license_url='https://www.openstreetmap.org/copyright',attribution='© OpenStreetMap contributors',dataset_kind='SYNTHETIC_TEST_ONLY')

class ProvisionTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory()
  self.addCleanup(self.temp.cleanup)
  self.dir=Path(self.temp.name)
  self.input=self.dir/'input.mbtiles'
  shutil.copyfile(EXAMPLE,self.input)
  self.output=self.dir/'output.mbtiles'
 def test_accepts_known_demo_and_creates_hash_manifest(self):
  result=module.provision(self.input,self.output,**ARGS)
  saved=json.loads(self.output.with_suffix('.manifest.json').read_text())
  self.assertEqual(result['sha256'],module.sha256_file(self.input))
  self.assertEqual(saved['classification'],'SYNTHETIC_TEST_ONLY')
  self.assertGreater(saved['tiles'],0)
  self.assertEqual(result['sha256'],module.sha256_file(self.output))
 def test_rejects_overwriting_by_default(self):
  module.provision(self.input,self.output,**ARGS)
  with self.assertRaises(FileExistsError):module.provision(self.input,self.output,**ARGS)
 def test_rejects_misleading_osm_attribution(self):
  with self.assertRaisesRegex(ValueError,'OpenStreetMap'):
   module.provision(self.input,self.output,**{**ARGS,'attribution':'Private government cadastre'})
 def test_requires_https_provenance_no_credentials(self):
  for bad in ('http://example.com','https://x:y@example.com/d','not-a-url'):
   with self.subTest(url=bad),self.assertRaises(ValueError):
    module.provision(self.input,self.output,**{**ARGS,'source_url':bad})
 def test_rejects_bad_tiles_and_symlink_sources(self):
  self.input.write_bytes(b'not an archive'*200)
  with self.assertRaises(Exception):module.provision(self.input,self.output,**ARGS)
  self.input.unlink()
  self.input.symlink_to(EXAMPLE)
  with self.assertRaisesRegex(ValueError,'symlink'):
   module.provision(self.input,self.output,**ARGS)
 def test_rejects_unknown_license_without_creating_output(self):
  with self.assertRaises(ValueError):module.provision(self.input,self.output,**{**ARGS,'license_id':'secret'})
  self.assertFalse(self.output.exists())
 def test_requires_explicit_dataset_classification(self):
  with self.assertRaises(ValueError):module.provision(self.input,self.output,**{**ARGS,'dataset_kind':'OFFICIAL_CADASTRE'})

if __name__=='__main__':unittest.main()
