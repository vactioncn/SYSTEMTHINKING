"""Validated, revisioned local records. The conversation agent is the only writer."""
import copy
import fcntl
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ID = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,79}$")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate(state):
    require(isinstance(state, dict), "记录必须是对象")
    require(state.get("schemaVersion") == 1, "不支持的结构版本")
    require(state.get("mode") in ("live", "example"), "mode 必须为 live 或 example")
    require(isinstance(state.get("revision"), int) and state["revision"] >= 0, "缺少有效版本号")
    topic = state.get("topic", {})
    require(isinstance(topic, dict) and isinstance(topic.get("title"), str) and bool(topic["title"].strip()), "缺少核心困局")
    require(topic.get("status") in ("pending", "confirmed"), "议题状态无效")
    require(isinstance(state.get("changeSummary"), str) and bool(state["changeSummary"].strip()), "缺少本轮更新说明")
    for key in ("sources", "nodes", "links", "threads", "questions"):
        require(isinstance(state.get(key), list), key + " 必须是数组")
    require(len(state["questions"]) <= 2, "每轮最多保留两个当前问题")
    require(all(isinstance(q, str) and q.strip() for q in state["questions"]), "当前问题必须是非空文字")
    ids = {}
    for key in ("sources", "nodes", "links", "threads"):
        ids[key] = set()
        for item in state[key]:
            require(isinstance(item, dict), key + " 中的条目必须是对象")
            ident = item.get("id", "")
            require(isinstance(ident, str) and ID.fullmatch(ident), "条目编号无效")
            require(ident not in ids[key], "编号重复: " + ident)
            ids[key].add(ident)

    def references(obj, key, target, needed=False):
        values = obj.get(key, [])
        require(isinstance(values, list) and all(isinstance(x, str) and x in ids[target] for x in values), "无效引用: " + key)
        require(not needed or len(values) > 0, "缺少来源: " + obj.get("id", "topic"))

    for source in state["sources"]:
        require(source.get("origin") in ("user", "record", "exercise"), "来源类型无效")
        require(all(isinstance(source.get(k), str) and source[k].strip() for k in ("label", "quote")), "来源需要标签和原文")
        require(state["mode"] == "example" or source["origin"] != "exercise", "教学示例不能写入真实记录")
    references(topic, "sourceIds", "sources", topic["status"] == "confirmed")
    for node in state["nodes"]:
        require(node.get("quadrant") in ("I", "It", "We", "Its"), "象限无效")
        require(node.get("kind") in ("opinion", "observation", "outcome", "system", "clue"), "记录类型无效")
        require(node.get("status") in ("reported", "verified", "hypothesis", "revised"), "记录状态无效")
        if node["status"] == "verified":
            require(isinstance(node.get("verification"), str) and bool(node["verification"].strip()), "已核实的记录需要明确的核实依据")
        require(isinstance(node.get("title"), str) and bool(node["title"].strip()), "记录标题不能为空")
        require(isinstance(node.get("detail", ""), str), "详情必须为文字")
        require(isinstance(node.get("openQuestions", []), list) and all(isinstance(q, str) for q in node.get("openQuestions", [])), "待核实事项必须是文字列表")
        require(isinstance(node.get("fields", {}), dict) and all(isinstance(k, str) and isinstance(v, str) for k, v in node.get("fields", {}).items()), "结构细节必须是文字映射")
        references(node, "sourceIds", "sources", True)
    for link in state["links"]:
        require(link.get("from") in ids["nodes"] and link.get("to") in ids["nodes"], "连线端点不存在")
        require(link["from"] != link["to"], "不支持自连线")
        require(link.get("status") in ("confirmed", "hypothesis"), "联系状态无效")
        require(isinstance(link.get("label"), str) and bool(link["label"].strip()), "联系需要说明")
        require(isinstance(link.get("basis"), str) and bool(link["basis"].strip()), "联系需要依据，不能自动生成因果")
        references(link, "sourceIds", "sources", True)
    for thread in state["threads"]:
        require(isinstance(thread.get("title"), str) and bool(thread["title"].strip()), "线索需要标题")
        references(thread, "nodeIds", "nodes", True)
    return state


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def atomic_write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".mpi-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def commit(candidate, expected_revision, data_dir=None):
    folder = Path(data_dir or ROOT / "data")
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / ".write.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        current = validate(read(folder / "state.json"))
        require(current["revision"] == expected_revision, "记录已更新，请重新读取后合并，避免覆盖另一轮对话")
        updated = copy.deepcopy(candidate)
        require(updated.get("mode") == "live", "真实记录只能写入 live 数据")
        require(updated.get("revision") == expected_revision, "候选记录必须以当前版本为基础")
        updated["revision"] = expected_revision + 1
        updated["updatedAt"] = datetime.now(timezone.utc).isoformat()
        validate(updated)
        history = folder / "history"
        if not (history / (str(current["revision"]) + ".json")).exists():
            atomic_write(history / (str(current["revision"]) + ".json"), current)
        atomic_write(history / (str(updated["revision"]) + ".json"), updated)
        atomic_write(folder / "state.json", updated)
        return updated
