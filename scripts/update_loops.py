#!/usr/bin/env python3
"""Codex: read, prepare a full candidate preserving stable IDs, then commit."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from store import read
from loop_store import initialize, validate_workspace, commit_workspace

parser = argparse.ArgumentParser(description="读取或更新系统回路图；与四象限记录独立保存")
parser.add_argument("file", nargs="?")
parser.add_argument("--expect", type=int)
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
try:
    current = initialize()
    candidate = validate_workspace(read(args.file)) if args.file else current
    if args.check:
        print("回路图结构校验通过")
    elif args.file:
        if args.expect is None:
            parser.error("写入必须提供 --expect，避免覆盖网页编辑")
        result = commit_workspace(candidate, args.expect)
        print(json.dumps({k: result[k] for k in ("revision", "updatedAt", "changeSummary")}, ensure_ascii=False))
    else:
        print(json.dumps(candidate, ensure_ascii=False, indent=2))
except (ValueError, OSError, KeyError, TypeError) as exc:
    print(str(exc), file=sys.stderr)
    sys.exit(1)
