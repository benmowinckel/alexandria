#!/usr/bin/env python3
"""Cursor hook: log agent loop end and optionally request self-check."""

from __future__ import annotations

import json
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

os.umask(0o077)


def _default_followup() -> str:
    return (
        "Alexandria close-out: evaluate the completed output against "
        "`~/alexandria/files/core/agent.md`. If any material violation exists, name it in one bullet. "
        "If clean, reply exactly: `Alexandria check clean.`"
    )


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()


def _as_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _parse_payload(raw: str) -> dict:
    try:
        return json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return {}


def _append_jsonl(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def _run() -> None:
    root = Path((os.environ.get("ALEXANDRIA_ROOT") or "").strip()).expanduser() \
        if (os.environ.get("ALEXANDRIA_ROOT") or "").strip() else Path.home() / "alexandria"
    if not (Path.home() / ".local/share/alexandria/.setup_complete").is_file():
        _emit({})
        return
    payload = _parse_payload(sys.stdin.read())

    log_path = Path.home() / ".alexandria" / "logs" / "cursor-stop.jsonl"

    row = {
        **payload,
        "ts": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "hook": "stop",
        "cursor_project_dir": os.environ.get("CURSOR_PROJECT_DIR"),
        "alexandria_session_id": os.environ.get("ALEXANDRIA_SESSION_ID"),
    }
    try:
        _append_jsonl(log_path, row)
    except OSError:
        # Logging should never block stop hook behavior.
        pass

    home = Path.home()
    flag = home / ".alexandria" / "flags" / "enable-stop-self-check"
    out: dict = {}

    if flag.is_file():
        try:
            custom = flag.read_text(encoding="utf-8").strip()
        except OSError:
            custom = ""
        lower = custom.lower()
        if lower in {"0", "off", "false", "no"}:
            msg = ""
        elif lower in {"1", "on", "true", "yes", "default"}:
            msg = _default_followup()
        else:
            msg = custom if custom else _default_followup()
        status = str(payload.get("status") or "")
        loop_count = _as_int(payload.get("loop_count"), 0)
        if status == "completed" and loop_count == 0 and msg:
            out["followup_message"] = msg

    _emit(out)


def main() -> None:
    try:
        _run()
    except Exception:
        traceback.print_exc(file=sys.stderr)
        _emit({})


if __name__ == "__main__":
    main()
