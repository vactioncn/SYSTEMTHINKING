import copy
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from loop_store import initialize, validate_workspace, commit_workspace
from store import read
from server import Handler, ThreadingHTTPServer


class LoopStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        self.initial = initialize(self.folder)

    def tearDown(self):
        self.temp.cleanup()

    def test_example_separated_and_quadrant_records_not_touched(self):
        self.assertEqual([g['mode'] for g in self.initial['diagrams']], ['example', 'live'])
        self.assertEqual(self.initial['diagrams'][1]['nodes'], [])
        candidate = copy.deepcopy(self.initial)
        candidate['diagrams'][0]['nodes'][0]['x'] += 100
        candidate['changeSummary'] = '调整示例变量位置'
        result = commit_workspace(candidate, 0, self.folder)
        self.assertEqual(result['revision'], 1)
        self.assertEqual(read(self.folder / 'loop-history/0.json'), self.initial)
        self.assertFalse((self.folder / 'state.json').exists())
        with self.assertRaisesRegex(ValueError, '版本冲突'):
            commit_workspace(candidate, 0, self.folder)
        self.assertEqual(read(self.folder / 'loops.json'), result)

    def test_invalid_references_and_unjustified_confirmation_do_not_save(self):
        candidate = copy.deepcopy(self.initial)
        candidate['diagrams'][0]['edges'][0]['to'] = 'missing'
        with self.assertRaisesRegex(ValueError, '端点不存在'):
            commit_workspace(candidate, 0, self.folder)
        candidate = copy.deepcopy(self.initial)
        candidate['diagrams'][0]['loops'][0]['edgeIds'] = ['missing']
        with self.assertRaisesRegex(ValueError, '不存在的连线'):
            validate_workspace(candidate)
        candidate = copy.deepcopy(self.initial)
        candidate['diagrams'][0]['edges'][0]['basis'] = ''
        with self.assertRaisesRegex(ValueError, '依据'):
            validate_workspace(candidate)
        self.assertEqual(read(self.folder / 'loops.json'), self.initial)

    def test_invalid_geometry_and_duplicates_rejected(self):
        for value in [float('nan'), float('inf'), '42', True, 1000001]:
            candidate = copy.deepcopy(self.initial)
            candidate['diagrams'][0]['nodes'][0]['x'] = value
            with self.assertRaises(ValueError):
                validate_workspace(candidate)
        candidate = copy.deepcopy(self.initial)
        candidate['diagrams'][0]['nodes'].append(copy.deepcopy(candidate['diagrams'][0]['nodes'][0]))
        with self.assertRaisesRegex(ValueError, '重复'):
            validate_workspace(candidate)

    def test_save_large_graph_roundtrip(self):
        candidate = copy.deepcopy(self.initial)
        g = candidate['diagrams'][1]
        for i in range(1000):
            g['nodes'].append(dict(id=f'n{i}', label=f'变量 {i}', x=i % 40 * 300, y=i // 40 * 200, width=240, fontSize=28, color='#29434e'))
        for i in range(2000):
            g['edges'].append(dict(id=f'e{i}', **{'from':f'n{i%1000}', 'to':f'n{(i+1+i//1000)%1000}'}, polarity='?', status='hypothesis', delay=False, color='#27858b'))
        result = commit_workspace(candidate, 0, self.folder)
        self.assertEqual(read(self.folder / 'loops.json'), result)
        self.assertEqual(len(result['diagrams'][1]['edges']), 2000)

    def test_http_save_sync_history_conflict_and_origin(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.data_dir = self.folder
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{server.server_port}'
        def post(value, origin=base):
            return urlopen(Request(base+'/api/loops', data=json.dumps(value).encode(), headers={'Content-Type':'application/json','Origin':origin}))
        try:
            initial = json.load(urlopen(base+'/api/loops'))
            initial['diagrams'][0]['title'] = '网页保存后的标题'
            payload = {'expectedRevision':0,'workspace':initial}
            saved = json.load(post(payload))
            self.assertEqual(saved['revision'], 1)
            self.assertEqual(json.load(urlopen(base+'/api/loops'))['diagrams'][0]['title'], '网页保存后的标题')
            self.assertEqual(json.load(urlopen(base+'/api/loops/history/0')), self.initial)
            with self.assertRaises(HTTPError) as err:
                post(payload)
            self.assertEqual(err.exception.code, 409)
            with self.assertRaises(HTTPError) as err:
                post(payload, 'https://untrusted.example')
            self.assertEqual(err.exception.code, 403)
            self.assertEqual(json.load(urlopen(base+'/api/loops')), saved)
            self.assertIn(b'editor.js',urlopen(base+'/loops').read())
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
