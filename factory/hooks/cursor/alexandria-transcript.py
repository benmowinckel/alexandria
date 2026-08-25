#!/usr/bin/env python3
"""Cursor hook: capture the session transcript, one raw event per line.

Wired to beforeSubmitPrompt and afterAgentResponse in hooks.json. Cursor never
hands us a transcript file the way Claude Code does at SessionEnd, so this hook
builds one: every event's full stdin payload is appended untouched to a staging
file, and alexandria-session-end.py flushes that file into the vault through
the same payload.sh path Claude Code transcripts take.

Schemaless on purpose — the whole event JSON is the line, no field picked out.
If Cursor renames or adds fields, capture never breaks and the extraction
engine just gets more; the vault is the full-fidelity source, the model lifts
what it needs.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

os.umask(0o077)

# Staging lives OUTSIDE ~/alexandria: the repo's session-end `git add -A` must
# never commit a half-written transcript. The finished copy lands in
# files/vault/ (and syncs) only at session end.
STAGING_DIR = Path.home() / ".alexandria" / "transcripts"


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()


def _run() -> None:
    root = Path((os.environ.get("ALEXANDRIA_ROOT") or "").strip()).expanduser() \
        if (os.environ.get("ALEXANDRIA_ROOT") or "").strip() else Path.home() / "alexandria"
    if not (Path.home() / ".local/share/alexandria/.setup_complete").is_file():
        _emit({})
        return
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        # Full fidelity beats parseability — keep the bytes we got.
        payload = {"unparsed": raw}

    # Event label: argv if hooks.json passed one, else whatever the payload
    # carries. Label is a convenience — the raw payload is the record.
    event = sys.argv[1] if len(sys.argv) > 1 else ""
    if not event and isinstance(payload, dict):
        event = str(
            payload.get("hook_event_name")
            or payload.get("hookEventName")
            or payload.get("event")
            or ""
        )
    event = event or "unknown"

    session_id = str(
        payload.get("session_id") or payload.get("conversation_id") or "unknown"
    )
    # Session ids come from Cursor; sanitise before using as a filename.
    safe_id = "".join(c for c in session_id if c.isalnum() or c in "-_") or "unknown"

    row = {
        "ts": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "hook": event,
        **(payload if isinstance(payload, dict) else {"payload": payload}),
    }

    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    with (STAGING_DIR / f"cursor-{safe_id}.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")

    # Delivery truth, not renderer truth: only an actual completed assistant
    # message containing the exact owned cue earns the local delivered receipt.
    if event == "afterAgentResponse" and isinstance(payload, dict):
        text = str(payload.get("text") or "")
        renderer = Path.home() / ".local/share/alexandria/scripts/statusline.sh"
        if renderer.is_file():
            try:
                cue = subprocess.run(
                    ["bash", str(renderer), "footer"],
                    capture_output=True,
                    text=True,
                    timeout=2,
                    check=False,
                ).stdout.strip()
                if cue and cue in text:
                    subprocess.run(
                        ["bash", str(renderer), "record-footer"],
                        stdin=subprocess.DEVNULL,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=2,
                        check=False,
                    )
            except (OSError, subprocess.TimeoutExpired):
                pass

    _emit({})


def main() -> None:
    try:
        _run()
    except Exception:
        # Capture must never block the Author's prompt or the agent's reply.
        traceback.print_exc(file=sys.stderr)
        _emit({})


if __name__ == "__main__":
    main()
