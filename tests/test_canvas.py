import copy
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from store import ROOT, atomic_write, commit, read, validate
from server import Handler, ThreadingHTTPServer, standalone


class Records(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        self.initial = read(ROOT / "data/state.json")
        self.initial.update(revision=0, sources=[], nodes=[], links=[], threads=[], questions=[])
        self.initial["topic"] = {"title": "测试议题", "status": "pending", "sourceIds": []}
        atomic_write(self.folder / "state.json", self.initial)

    def tearDown(self):
        self.temp.cleanup()

    def candidate(self):
        value = copy.deepcopy(self.initial)
        value["changeSummary"] = "测试：记录一个初始观点"
        value["sources"] = [{"id": "s1", "origin": "user", "label": "合成测试原话", "quote": "这是一条用于验证保存的观点，不是用户公司事实。"}]
        value["nodes"] = [{"id": "n1", "quadrant": "It", "kind": "opinion", "status": "reported", "title": "合成测试观点", "sourceIds": ["s1"], "detail": "", "openQuestions": []}]
        return value

    def test_revision_keeps_identity_and_previous_snapshot(self):
        first = commit(self.candidate(), 0, self.folder)
        updated = copy.deepcopy(first)
        updated["nodes"][0]["title"] = "修正后的同一观点"
        updated["nodes"][0]["status"] = "revised"
        updated["changeSummary"] = "修正原表述"
        second = commit(updated, 1, self.folder)
        self.assertEqual(second["revision"], 2)
        self.assertEqual(len(second["nodes"]), 1)
        self.assertEqual(second["nodes"][0]["id"], "n1")
        self.assertEqual(read(self.folder / "history/1.json")["nodes"][0]["title"], "合成测试观点")
        self.assertEqual(read(self.folder / "state.json"), second)

    def test_stale_revision_does_not_overwrite(self):
        first = commit(self.candidate(), 0, self.folder)
        with self.assertRaisesRegex(ValueError, "记录已更新"):
            commit(self.candidate(), 0, self.folder)
        self.assertEqual(read(self.folder / "state.json"), first)

    def test_rejects_dangling_link_and_duplicate_ids(self):
        value = self.candidate()
        value["links"] = [{"id": "l1", "from": "n1", "to": "missing", "status": "hypothesis", "label": "待核实", "basis": "测试", "sourceIds": ["s1"]}]
        with self.assertRaisesRegex(ValueError, "端点不存在"):
            commit(value, 0, self.folder)
        value["links"] = []
        value["nodes"].append(copy.deepcopy(value["nodes"][0]))
        with self.assertRaisesRegex(ValueError, "编号重复"):
            validate(value)
        self.assertEqual(read(self.folder / "state.json")["revision"], 0)

    def test_exercise_cannot_be_committed_to_live(self):
        value = read(ROOT / "examples/sales.json")
        with self.assertRaises(ValueError):
            commit(value, 0, self.folder)
        value["mode"] = "live"
        with self.assertRaisesRegex(ValueError, "教学示例"):
            commit(value, 0, self.folder)

    def test_verification_requires_basis_and_questions_are_limited(self):
        value = self.candidate()
        value["nodes"][0]["status"] = "verified"
        with self.assertRaisesRegex(ValueError, "核实依据"):
            validate(value)
        value["nodes"][0]["verification"] = "合成测试依据"
        validate(value)
        value["questions"] = ["问题一", "问题二", "问题三"]
        with self.assertRaisesRegex(ValueError, "最多"):
            validate(value)

    def test_standalone_embeds_data_without_script_injection_or_dependencies(self):
        value = self.candidate()
        value["nodes"][0]["title"] = '</script><script>alert("x")</script>'
        result = standalone(value).decode("utf-8")
        self.assertNotIn(value["nodes"][0]["title"], result)
        self.assertIn("\\u003c/script>", result)
        self.assertNotIn('src="/app.js"', result)
        self.assertNotIn('href="/style.css"', result)
        self.assertIn("window.MPI_SNAPSHOT=", result)

    def test_http_sees_commits_history_and_offline_export(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        server.data_dir = self.folder
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        base = "http://127.0.0.1:" + str(server.server_port)
        try:
            first = json.load(urlopen(base + "/api/state"))
            self.assertEqual(first["revision"], 0)
            commit(self.candidate(), 0, self.folder)
            self.assertEqual(json.load(urlopen(base + "/api/state"))["revision"], 1)
            self.assertEqual(json.load(urlopen(base + "/api/history/0"))["nodes"], [])
            self.assertEqual(len(json.load(urlopen(base + "/api/history"))), 2)
            html = urlopen(base + "/api/export?format=html").read().decode("utf-8")
            self.assertIn("合成测试观点", html)
            with self.assertRaises(HTTPError) as error:
                urlopen(base + "/api/history/9")
            self.assertEqual(error.exception.code, 404)
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(base + "/api/state", headers={"Host": "attacker.invalid"}))
            self.assertEqual(error.exception.code, 403)
        finally:
            server.shutdown()
            server.server_close()
            worker.join()


if __name__ == "__main__":
    unittest.main()
