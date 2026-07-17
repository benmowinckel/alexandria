#!/usr/bin/env python3
"""Cursor hook: flush the session into Alexandria at session end.

Thin adapter over the same signed shim -> payload chain Claude Code runs at
SessionEnd. The staging transcript alexandria-transcript.py accumulated is
handed to the shim exactly the way Claude Code hands its transcript_path —
payload.sh then does the rest: transcript -> vault, Author feedback POST,
git commit + push of ~/alexandria. One behavior source across harnesses.

If the shim is missing, the transcript still reaches the vault directly
(mirrors shim.sh's own bare fallback). The capture loop closes either way.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

STAGING_DIR = Path.home() / ".alexandria" / "transcripts"
# Vault copy is local-fast; the network parts (feedback POST, git push) are
# short-timeout or backgrounded inside payload.sh.
SHIM_TIMEOUT_SECONDS = 25


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()


def _parse_payload(raw: str) -> dict:
    try:
        parsed = json.loads(raw) if raw.strip() else {}
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _append_jsonl(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def _resolve_root(home: Path) -> Path:
    raw = (os.environ.get("ALEXANDRIA_ROOT") or "").strip()
    if raw:
        p = Path(raw).expanduser()
        if p.is_dir():
            return p
    return home / "alexandria"


def _staging_file(payload: dict) -> Path | None:
    session_id = str(
        payload.get("session_id") or payload.get("conversation_id") or "unknown"
    )
    safe_id = "".join(c for c in session_id if c.isalnum() or c in "-_") or "unknown"
    candidate = STAGING_DIR / f"cursor-{safe_id}.jsonl"
    if candidate.is_file():
        return candidate
    # Session id missing or mismatched — fall back to the unknown-bucket file
    # so degraded capture still flushes.
    fallback = STAGING_DIR / "cursor-unknown.jsonl"
    if fallback.is_file():
        return fallback
    return None


def _flush_via_shim(root: Path, transcript: Path | None) -> str:
    """Run shim session-end (vault copy + feedback POST + git sync).

    Returns status: "ok" | "missing" | "timeout" | "error:<detail>"
    """
    shim = root / "system" / "hooks" / "shim.sh"
    if not shim.is_file():
        return "missing"
    env = dict(os.environ)
    env["ALEXANDRIA_DIR"] = str(root)
    # shim.sh session-end greps stdin for transcript_path — feed it the same
    # JSON shape Claude Code does.
    stdin_payload = json.dumps(
        {"transcript_path": str(transcript)} if transcript else {}
    )
    try:
        proc = subprocess.run(
            ["bash", str(shim), "session-end"],
            input=stdin_payload,
            capture_output=True,
            text=True,
            timeout=SHIM_TIMEOUT_SECONDS,
            env=env,
        )
    except subprocess.TimeoutExpired:
        return "timeout"
    except OSError as exc:
        return f"error:{exc}"
    if proc.returncode != 0:
        detail = (proc.stderr or "").strip().splitlines()
        return f"error:rc={proc.returncode} {detail[-1] if detail else ''}".strip()
    return "ok"


def _flush_bare(root: Path, transcript: Path) -> str:
    """No shim — copy the transcript straight into the vault (bare fallback)."""
    try:
        vault = root / "files" / "vault"
        vault.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
        shutil.copy2(str(transcript), str(vault / f"{stamp}.jsonl"))
        return "bare-ok"
    except OSError as exc:
        return f"bare-error:{exc}"


def _vault_has_copy(root: Path, transcript: Path) -> bool:
    """True when a vault file matching the staging transcript's size exists.

    payload.sh's `cp` isn't error-checked, so shim rc=0 alone doesn't prove
    the bytes landed. Size match on a recent vault .jsonl is the cheap
    ground-truth check before the staging copy is deleted.
    """
    try:
        size = transcript.stat().st_size
        vault = root / "files" / "vault"
        for f in vault.glob("*.jsonl"):
            if f.stat().st_size == size:
                return True
    except OSError:
        pass
    return False


def _run() -> None:
    payload = _parse_payload(sys.stdin.read())
    home = Path.home()
    root = _resolve_root(home)

    transcript = _staging_file(payload)
    transcript_lines = 0
    if transcript is not None:
        try:
            with transcript.open("r", encoding="utf-8") as f:
                transcript_lines = sum(1 for _ in f)
        except OSError:
            pass

    flush_status = _flush_via_shim(root, transcript)
    if flush_status == "missing" and transcript is not None:
        flush_status = _flush_bare(root, transcript)

    # Remove staging only when the transcript verifiably reached the vault —
    # on any failure it stays put and the session-start orphan sweep (or the
    # next successful flush) picks it up. Never delete the only copy.
    if transcript is not None:
        if flush_status == "ok" and not _vault_has_copy(root, transcript):
            flush_status = "ok-but-vault-copy-unverified"
        if flush_status in {"ok", "bare-ok"}:
            try:
                transcript.unlink()
            except OSError:
                pass

    row = {
        **payload,
        "ts": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "hook": "sessionEnd",
        "cursor_project_dir": os.environ.get("CURSOR_PROJECT_DIR"),
        "alexandria_session_id": os.environ.get("ALEXANDRIA_SESSION_ID"),
        "transcript_file": str(transcript) if transcript else None,
        "transcript_lines": transcript_lines,
        "flush_status": flush_status,
    }
    try:
        _append_jsonl(home / ".alexandria" / "logs" / "cursor-session-end.jsonl", row)
    except OSError:
        # Logging should never block session cleanup.
        pass

    _emit({})


def main() -> None:
    try:
        _run()
    except Exception:
        traceback.print_exc(file=sys.stderr)
        _emit({})


if __name__ == "__main__":
    main()
