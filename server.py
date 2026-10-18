#!/usr/bin/env python3
"""Local four-quadrant reader and revisioned causal-map editor."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from store import ROOT, read, validate
from loop_store import initialize as initialize_loops, validate_workspace, commit_workspace


def standalone(state):
    html = (ROOT / "web/index.html").read_text(encoding="utf-8")
    css = (ROOT / "web/style.css").read_text(encoding="utf-8")
    js = (ROOT / "web/app.js").read_text(encoding="utf-8")
    payload = json.dumps(state, ensure_ascii=False).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    html = html.replace('<link rel="stylesheet" href="/style.css">', "<style>" + css + "</style>")
    html = html.replace('<script src="/app.js" defer></script>', "<script>window.MPI_SNAPSHOT=" + payload + ";</script><script defer>" + js + "</script>")
    return html.encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, body, status=200, content_type="application/json; charset=utf-8", filename=None):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        if filename:
            self.send_header("Content-Disposition", 'attachment; filename="' + filename + '"')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        host = self.headers.get("Host", "")
        valid_hosts = {"127.0.0.1:" + str(self.server.server_port), "localhost:" + str(self.server.server_port)}
        if host not in valid_hosts or self.headers.get("Sec-Fetch-Site") == "cross-site":
            return self.respond({"error": "此画布仅供本机访问"}, 403)
        url = urlparse(self.path)
        path = url.path
        try:
            folder = getattr(self.server, "data_dir", ROOT / "data")
            if path.startswith("/api/loops"):
                workspace = initialize_loops(folder)
                if path == "/api/loops":
                    return self.respond(workspace)
                if path == "/api/loops/history":
                    versions = []
                    for file in (folder / "loop-history").glob("*.json"):
                        if file.stem.isdigit() and int(file.stem) <= workspace["revision"]:
                            value = read(file)
                            versions.append({k: value.get(k) for k in ("revision", "updatedAt", "changeSummary")})
                    if not any(v["revision"] == workspace["revision"] for v in versions):
                        versions.append({k: workspace.get(k) for k in ("revision", "updatedAt", "changeSummary")})
                    return self.respond(sorted(versions, key=lambda v: v["revision"], reverse=True))
                if path.startswith("/api/loops/history/"):
                    revision = path.rsplit("/", 1)[-1]
                    if not revision.isdigit() or int(revision) > workspace["revision"]:
                        return self.respond({"error": "没有这个历史版本"}, 404)
                    return self.respond(workspace if int(revision) == workspace["revision"] else validate_workspace(read(folder / "loop-history" / (str(int(revision)) + ".json"))))
                return self.respond({"error": "未找到"}, 404)
            state = validate(read(folder / "state.json")) if path.startswith("/api/") else None
            if path == "/api/state":
                return self.respond(state)
            if path == "/api/example":
                return self.respond(validate(read(ROOT / "examples/sales.json")))
            if path == "/api/history":
                versions = []
                for file in (folder / "history").glob("*.json"):
                    if file.stem.isdigit() and int(file.stem) <= state["revision"]:
                        item = read(file)
                        versions.append({k: item.get(k) for k in ("revision", "updatedAt", "changeSummary")})
                if not any(item["revision"] == state["revision"] for item in versions):
                    versions.append({k: state.get(k) for k in ("revision", "updatedAt", "changeSummary")})
                return self.respond(sorted(versions, key=lambda x: x["revision"], reverse=True))
            if path.startswith("/api/history/"):
                rev = path.rsplit("/", 1)[-1]
                if not rev.isdigit() or int(rev) > state["revision"]:
                    return self.respond({"error": "没有这个历史版本"}, 404)
                return self.respond(state if int(rev) == state["revision"] else validate(read(folder / "history" / (str(int(rev)) + ".json"))))
            if path == "/api/export":
                query = parse_qs(url.query)
                if query.get("mode") == ["example"]:
                    state = validate(read(ROOT / "examples/sales.json"))
                elif "revision" in query:
                    rev = query["revision"][0]
                    if not rev.isdigit() or int(rev) > state["revision"]:
                        return self.respond({"error": "版本无效"}, 400)
                    if int(rev) != state["revision"]:
                        state = validate(read(folder / "history" / (str(int(rev)) + ".json")))
                name = "mpi-" + state["mode"] + "-v" + str(state["revision"])
                if query.get("format") == ["html"]:
                    return self.respond(standalone(state), content_type="text/html; charset=utf-8", filename=name + ".html")
                return self.respond(state, filename=name + ".json")
            assets = {"/": ("index.html", "text/html"), "/index.html": ("index.html", "text/html"), "/app.js": ("app.js", "text/javascript"), "/style.css": ("style.css", "text/css")}
            assets.update({"/loops": ("loops/index.html", "text/html"), "/loops/": ("loops/index.html", "text/html"), "/loops/style.css": ("loops/style.css", "text/css"), "/loops/editor.js": ("loops/editor.js", "text/javascript"), "/loops/core.js": ("loops/core.js", "text/javascript")})
            if path in assets:
                name, mime = assets[path]
                return self.respond((ROOT / "web" / name).read_bytes(), content_type=mime + "; charset=utf-8")
            return self.respond({"error": "未找到"}, 404)
        except FileNotFoundError:
            return self.respond({"error": "记录尚不存在"}, 404)
        except (ValueError, KeyError, TypeError) as exc:
            return self.respond({"error": "记录读取失败：" + str(exc)}, 500)

    def do_POST(self):
        host = self.headers.get("Host", "")
        hosts = {"127.0.0.1:" + str(self.server.server_port), "localhost:" + str(self.server.server_port)}
        origin = self.headers.get("Origin")
        if host not in hosts or self.headers.get("Sec-Fetch-Site") == "cross-site" or (origin and origin != "http://" + host):
            return self.respond({"error": "只接受本机画布的保存请求"}, 403)
        if urlparse(self.path).path != "/api/loops":
            return self.respond({"error": "未找到"}, 404)
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self.respond({"error": "请使用 JSON 保存"}, 415)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 16 * 1024 * 1024:
                return self.respond({"error": "图集文件需小于 16 MB"}, 413)
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict) or not isinstance(payload.get("workspace"), dict):
                raise ValueError("缺少完整图集")
            folder = getattr(self.server, "data_dir", ROOT / "data")
            initialize_loops(folder)
            result = commit_workspace(payload["workspace"], payload.get("expectedRevision"), folder)
            return self.respond(result)
        except (ValueError, KeyError, TypeError) as exc:
            return self.respond({"error": str(exc)}, 409 if "版本冲突" in str(exc) else 400)
        except OSError:
            return self.respond({"error": "保存失败，请保留当前草稿后重试"}, 500)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4317)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data")
    args = parser.parse_args()
    validate(read(args.data_dir / "state.json"))
    initialize_loops(args.data_dir)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.data_dir = args.data_dir.resolve()
    print("四象限画布 · http://127.0.0.1:" + str(args.port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
