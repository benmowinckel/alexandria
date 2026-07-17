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
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

# Staging lives OUTSIDE ~/alexandria: the repo's session-end `git add -A` must
# never commit a half-written transcript. The finished copy lands in
# files/vault/ (and syncs) only at session end.
STAGING_DIR = Path.home() / ".alexandria" / "transcripts"


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()


def _run() -> None:
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
