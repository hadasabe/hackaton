import importlib.util
import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from server import make_server

class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=make_server(0)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def test_runtime_and_headers(self):
        for path in ['/','/geo.js','/data/places.js','/vendor/leaflet.js','/assets/icon-192.png','/sw.js']:
            with urllib.request.urlopen(self.base+path) as r:
                self.assertEqual(r.status,200)
                self.assertEqual(r.headers['X-Content-Type-Options'],'nosniff')
                self.assertIn('geolocation=(self)',r.headers['Permissions-Policy'])
    def test_private_files_and_traversal_are_not_served(self):
        for path in ['/AGENTS.md','/.env','/server.py','/tools/generate_audio.py','/%2e%2e/README.md','/preview/cards.png']:
            with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(self.base+path)
            self.assertEqual(error.exception.code,404)
    def test_manifest_icons_exist(self):
        manifest=json.loads((ROOT/'manifest.webmanifest').read_text(encoding='utf-8'))
        for icon in manifest['icons']:self.assertTrue((ROOT/icon['src']).is_file())
    def test_html_ids_and_controller_targets(self):
        from html.parser import HTMLParser
        import re
        class IDs(HTMLParser):
            def __init__(self):super().__init__();self.ids=[]
            def handle_starttag(self,tag,attrs):
                value=dict(attrs).get('id')
                if value:self.ids.append(value)
        parser=IDs();parser.feed((ROOT/'index.html').read_text(encoding='utf-8-sig'))
        self.assertEqual(len(parser.ids),len(set(parser.ids)))
        for target in re.findall(r"\$\('([^']+)'\)",(ROOT/'app.js').read_text(encoding='utf-8-sig')):
            self.assertIn(target,parser.ids)
    def test_audio_dry_run_never_calls_network(self):
        from unittest.mock import patch
        spec=importlib.util.spec_from_file_location('generate_audio',ROOT/'tools/generate_audio.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with patch.object(sys,'argv',['generate_audio','--dry-run']),patch('urllib.request.urlopen') as network:
            self.assertEqual(module.main(),0);network.assert_not_called()
        with patch.object(sys,'argv',['generate_audio']),patch('urllib.request.urlopen') as network:
            self.assertEqual(module.main(),2);network.assert_not_called()

if __name__=='__main__':unittest.main()
