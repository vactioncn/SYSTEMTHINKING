#!/usr/bin/env python3
"""Read/validate/commit a complete snapshot prepared from the Codex conversation."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from store import ROOT, commit, read, validate

parser = argparse.ArgumentParser(description="保存 Codex 对话整理后的四象限记录")
parser.add_argument("file", nargs="?", help="完整候选 JSON；不填则读取当前记录")
parser.add_argument("--expect", type=int, help="写入前预期的当前版本号")
parser.add_argument("--check", action="store_true", help="仅校验，不写入")
args = parser.parse_args()
try:
    data = validate(read(args.file or ROOT / "data/state.json"))
    if args.check:
        print("结构校验通过")
    elif args.file:
        if args.expect is None:
            parser.error("写入必须提供 --expect，防止覆盖更新")
        result = commit(data, args.expect)
        print(json.dumps({"revision": result["revision"], "updatedAt": result["updatedAt"], "summary": result["changeSummary"]}, ensure_ascii=False))
    else:
        print(json.dumps(data, ensure_ascii=False, indent=2))
except (ValueError, OSError, KeyError, TypeError) as exc:
    print(str(exc), file=sys.stderr)
    sys.exit(1)
