"""Independent, revisioned causal maps shared by the editor and Codex.

No inference is performed here: links and loop membership are explicit data.
The existing four-quadrant record is never modified by this module.
"""
import copy
import fcntl
import math
import re
from datetime import datetime, timezone
from pathlib import Path

from store import ROOT, ID, atomic_write, read, require

COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def text(value, name, required=False, maximum=20000):
    require(isinstance(value, str) and len(value) <= maximum, name + "必须是有效文字")
    require(not required or bool(value.strip()), name + "不能为空")


def number(value, name, low=-1000000, high=1000000):
    require(type(value) in (int, float) and math.isfinite(value) and low <= value <= high, name + "数值无效")


def validate_diagram(diagram):
    require(isinstance(diagram, dict), "图必须是对象")
    require(isinstance(diagram.get("id"), str) and ID.fullmatch(diagram["id"]), "图编号无效")
    text(diagram.get("title"), "图标题", True, 300)
    text(diagram.get("subtitle", ""), "副标题", maximum=1000)
    text(diagram.get("notes", ""), "图说明")
    require(diagram.get("mode") in ("live", "example"), "图类型无效")
    ids = {}
    for key in ("nodes", "edges", "loops"):
        require(isinstance(diagram.get(key), list), key + "必须是数组")
        ids[key] = set()
        for obj in diagram[key]:
            require(isinstance(obj, dict), "图元素必须是对象")
            ident = obj.get("id")
            require(isinstance(ident, str) and ID.fullmatch(ident), "元素编号无效")
            require(ident not in ids[key], "元素编号重复：" + ident)
            ids[key].add(ident)
            require(isinstance(obj.get("color"), str) and COLOR.fullmatch(obj["color"]), "颜色应为六位十六进制值")
    for node in diagram["nodes"]:
        text(node.get("label"), "变量名称", True, 1000)
        text(node.get("notes", ""), "变量说明")
        number(node.get("x"), "变量横坐标")
        number(node.get("y"), "变量纵坐标")
        number(node.get("width", 240), "文字宽度", 60, 1200)
        number(node.get("fontSize", 28), "文字大小", 12, 80)
        refs = node.get("sourceNodeIds", [])
        require(isinstance(refs, list) and all(isinstance(v, str) and ID.fullmatch(v) for v in refs), "四象限来源编号无效")
    for edge in diagram["edges"]:
        require(edge.get("from") in ids["nodes"] and edge.get("to") in ids["nodes"], "影响关系端点不存在")
        require(edge.get("polarity") in ("+", "-", "?"), "影响方向无效")
        require(edge.get("status") in ("confirmed", "hypothesis"), "影响关系状态无效")
        require(type(edge.get("delay", False)) is bool, "时间延迟应为布尔值")
        text(edge.get("label", ""), "关系说明", maximum=1000)
        text(edge.get("basis", ""), "关系依据")
        if edge["status"] == "confirmed":
            text(edge.get("basis"), "已确认关系的依据", True)
        number(edge.get("labelPosition", .86), "极性符号位置", .1, .98)
        number(edge.get("labelOffset", 22), "极性符号偏移", -200, 200)
        route = edge.get("route", {})
        require(isinstance(route, dict), "曲线控制点无效")
        for key in ("c1", "c2"):
            if key in route:
                require(isinstance(route[key], dict), "曲线控制点无效")
                number(route[key].get("along"), "控制点位置", -10, 10)
                number(route[key].get("offset"), "控制点偏移", -100000, 100000)
    for loop in diagram["loops"]:
        text(loop.get("title"), "回路名称", True, 300)
        text(loop.get("description", ""), "回路说明", maximum=2000)
        for key in ("x", "y", "labelX", "labelY"):
            number(loop.get(key), "回路坐标")
        for key in ("rx", "ry"):
            number(loop.get(key), "回路范围", 40, 100000)
        members = loop.get("edgeIds")
        require(isinstance(members, list) and all(isinstance(v, str) and v in ids["edges"] for v in members), "回路引用了不存在的连线")
        require(len(members) == len(set(members)), "回路成员重复")
    return diagram


def validate_workspace(workspace):
    require(isinstance(workspace, dict) and workspace.get("schemaVersion") == 1, "不支持的回路图结构版本")
    require(type(workspace.get("revision")) is int and workspace["revision"] >= 0, "图集版本无效")
    text(workspace.get("changeSummary"), "更新说明", True)
    require(isinstance(workspace.get("diagrams"), list) and len(workspace["diagrams"]) > 0, "图集至少保留一张图")
    seen = set()
    for diagram in workspace["diagrams"]:
        validate_diagram(diagram)
        require(diagram["id"] not in seen, "图编号重复")
        seen.add(diagram["id"])
    return workspace


def initialize(data_dir=None):
    folder = Path(data_dir or ROOT / "data")
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / ".loops.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = folder / "loops.json"
        if not path.exists():
            example = validate_diagram(read(ROOT / "examples/presales-loop.json"))
            blank = {"id": "company-sales", "title": "销售持续未达标 · 系统回路", "subtitle": "从变量和有依据的影响关系开始", "mode": "live", "notes": "围绕公司的真实困局继续探寻。示例中的关系不自动成为此图的事实。", "nodes": [], "edges": [], "loops": []}
            workspace = {"schemaVersion": 1, "revision": 0, "updatedAt": None, "changeSummary": "建立回路图空间，参考示例与真实分析分别保存", "diagrams": [example, blank]}
            atomic_write(path, validate_workspace(workspace))
        return validate_workspace(read(path))


def commit_workspace(candidate, expected_revision, data_dir=None):
    folder = Path(data_dir or ROOT / "data")
    with (folder / ".loops.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        current = validate_workspace(read(folder / "loops.json"))
        require(type(expected_revision) is int and current["revision"] == expected_revision, "版本冲突：图集已更新，请保留草稿并合并最新记录")
        require(candidate.get("revision") == expected_revision, "候选图集必须以当前版本为基础")
        updated = copy.deepcopy(candidate)
        updated["revision"] = expected_revision + 1
        updated["updatedAt"] = datetime.now(timezone.utc).isoformat()
        validate_workspace(updated)
        history = folder / "loop-history"
        if not (history / (str(current["revision"]) + ".json")).exists():
            atomic_write(history / (str(current["revision"]) + ".json"), current)
        atomic_write(history / (str(updated["revision"]) + ".json"), updated)
        atomic_write(folder / "loops.json", updated)
        return updated
