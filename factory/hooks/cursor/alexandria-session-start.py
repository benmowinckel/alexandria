#!/usr/bin/env python3
"""Cursor hook: inject Alexandria context at session start.

Thin adapter over the same signed shim -> payload chain Claude Code runs:
translate Cursor's JSON protocol, delegate the behavior. The shim output
carries everything payload.sh gives every harness — canon fetch + update
notices, installed-artefact drift, git sync, maintenance status, onboarding
(THE BLOCK), the Author-context pointer, protocol calls. One behavior source;
when payload.sh improves, Cursor improves with zero changes here.

Two things stay Cursor-native:
  1. agent.md is injected INLINE. Claude Code has a global instruction file
     (~/.claude/CLAUDE.md); Cursor has none — this injection fills that gap.
  2. Orphaned transcript staging files (crashed sessions that never reached
     sessionEnd) are swept into the vault so no capture is ever lost.

If the shim is missing or fails, fall back to local-only injection
(agent.md + constitution derivative + marginalia + onboarding notice) so a
degraded install still gets context. Soft default: the fallback is the floor,
the shim chain is the real path.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_MAX_CONTEXT_CHARS = 90000
# The shim verifies + fetches the payload and canon over the network before
# any output — same reason Claude Code wires it at 60s (hotel-wifi first
# sessions died at 10s). Capped below hooks.json's 60s so on timeout we still
# emit fallback context instead of Cursor killing us mid-write.
SHIM_TIMEOUT_SECONDS = 50
# Staging transcripts older than this belong to sessions that died without a
# sessionEnd (hard window close, crash). Sweep them into the vault.
ORPHAN_TRANSCRIPT_SECONDS = 12 * 3600


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off", ""}


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw.strip())
    except (TypeError, ValueError):
        return default


def _safe_resolve(path: Path) -> Path:
    try:
        return path.expanduser().resolve()
    except OSError:
        return path.expanduser()


def _read_or_note(path: Path, label: str) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        return f"(Failed to read {label} at `{path}`: {exc})\n"


def _is_untouched_template(text: str) -> bool:
    """True when agent.md is still the shipped starter stub (or trivially empty).

    The template is ~160 bytes: headings, one italic descriptor line, empty
    "- " bullets. Injecting that verbatim spends context budget on nothing and
    reads as noise — skip it until the Author writes a real preference. Any
    content line that isn't a heading, an empty bullet, or the italic
    descriptor counts as real.
    """
    stripped = text.strip()
    if len(stripped) < 50:
        return True
    for line in stripped.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#") or s in {"-", "*"}:
            continue
        if s.startswith("*") and s.endswith("*"):
            continue  # the template's italic descriptor line
        return False
    return True


def _truncate(text: str, max_chars: int) -> tuple[str, bool]:
    if max_chars < 1:
        return "", False
    if len(text) <= max_chars:
        return text, False
    marker = "\n\n[... truncated by session-start context budget ...]\n"
    room = max(0, max_chars - len(marker))
    return text[:room].rstrip() + marker, True


def _append_jsonl(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def _latest_source_mtime(source_dir: Path) -> float | None:
    if not source_dir.is_dir():
        return None
    latest: float | None = None
    for path in source_dir.glob("*.md"):
        if path.name.startswith("_"):
            continue
        try:
            mtime = path.stat().st_mtime
        except OSError:
            continue
        if latest is None or mtime > latest:
            latest = mtime
    return latest


def _derivative_status(source_dir: Path, derivative_path: Path) -> str:
    if not derivative_path.is_file():
        return "missing"
    try:
        derivative_mtime = derivative_path.stat().st_mtime
    except OSError:
        return "unknown"
    source_mtime = _latest_source_mtime(source_dir)
    if source_mtime is None:
        return "unknown"
    return "stale" if source_mtime > derivative_mtime else "fresh"


def _resolve_root(home: Path) -> Path:
    raw = (os.environ.get("ALEXANDRIA_ROOT") or "").strip()
    if raw:
        p = _safe_resolve(Path(raw))
        if p.is_dir():
            return p
    return _safe_resolve(home / "alexandria")


def _resolve_agent_path(home: Path, root: Path) -> Path:
    env_agent = (os.environ.get("ALEXANDRIA_AGENT_MD") or "").strip()
    candidates: list[Path] = []
    if env_agent:
        candidates.append(_safe_resolve(Path(env_agent)))
    candidates.append(_safe_resolve(root / "files" / "core" / "agent.md"))
    candidates.append(_safe_resolve(home / ".alexandria" / "agent.md"))
    candidates.append(_safe_resolve(home / "alexandria" / "files" / "core" / "agent.md"))

    seen: set[str] = set()
    unique: list[Path] = []
    for candidate in candidates:
        key = str(candidate)
        if key not in seen:
            seen.add(key)
            unique.append(candidate)

    for candidate in unique:
        if candidate.is_file():
            return candidate
    return unique[0]


def _derive_root(agent_path: Path, fallback: Path) -> Path:
    if (
        agent_path.parent.name == "core"
        and agent_path.parent.parent.name == "files"
        and len(agent_path.parents) >= 3
    ):
        return agent_path.parents[2]
    return fallback


def _run_shim(root: Path) -> tuple[str, str]:
    """Run the signed shim session-start chain. Returns (output, status).

    status: "ok" | "missing" | "timeout" | "error:<detail>"
    """
    shim = root / "system" / "hooks" / "shim.sh"
    if not shim.is_file():
        return "", "missing"
    env = dict(os.environ)
    env["ALEXANDRIA_DIR"] = str(root)
    try:
        proc = subprocess.run(
            ["bash", str(shim), "session-start"],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=SHIM_TIMEOUT_SECONDS,
            env=env,
        )
    except subprocess.TimeoutExpired as exc:
        partial = (exc.stdout or "") if isinstance(exc.stdout, str) else ""
        return partial, "timeout"
    except OSError as exc:
        return "", f"error:{exc}"
    if proc.returncode != 0 and not proc.stdout.strip():
        detail = (proc.stderr or "").strip().splitlines()
        return "", f"error:rc={proc.returncode} {detail[-1] if detail else ''}".strip()
    return proc.stdout, "ok"


def _sweep_orphan_transcripts(root: Path, home: Path) -> list[str]:
    """Move staging transcripts from dead sessions into the vault.

    A staging file that hasn't been touched in ORPHAN_TRANSCRIPT_SECONDS
    belongs to a session that never reached sessionEnd (hard window close,
    crash). The capture is the point — vault it rather than lose it. A live
    marathon session that gets swept self-heals: the transcript hook recreates
    the staging file on the next event and sessionEnd flushes the remainder.
    """
    staging_dir = home / ".alexandria" / "transcripts"
    if not staging_dir.is_dir():
        return []
    vault = root / "files" / "vault"
    swept: list[str] = []
    now = time.time()
    for staged in sorted(staging_dir.glob("cursor-*.jsonl")):
        try:
            if now - staged.stat().st_mtime < ORPHAN_TRANSCRIPT_SECONDS:
                continue
            vault.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
            dest = vault / f"{stamp}-{staged.stem}-recovered.jsonl"
            shutil.move(str(staged), str(dest))
            swept.append(dest.name)
        except OSError:
            continue  # never block session start on cleanup
    return swept


def _run() -> None:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        payload = {}

    home = Path.home()
    root_hint = _resolve_root(home)
    agent_path = _resolve_agent_path(home, root_hint)
    root = _derive_root(agent_path, root_hint)
    overlay = home / ".alexandria" / "inject" / "session-start.md"
    constitution_derivative = root / "files" / "constitution" / "_constitution.md"
    marginalia_file = root / "files" / "marginalia" / "marginalia.md"

    include_overlay = _env_bool("ALEXANDRIA_INCLUDE_OVERLAY", True)
    include_derivatives = _env_bool("ALEXANDRIA_INCLUDE_DERIVATIVES", True)
    max_chars = max(
        12000, _env_int("ALEXANDRIA_SESSION_CONTEXT_MAX_CHARS", DEFAULT_MAX_CONTEXT_CHARS)
    )

    session_id = str(payload.get("session_id") or "")
    is_bg = payload.get("is_background_agent")
    composer_mode = str(payload.get("composer_mode") or "")
    constitution_status = _derivative_status(
        root / "files" / "constitution", constitution_derivative
    )
    marginalia_status = _derivative_status(root / "files" / "marginalia", marginalia_file)

    swept = _sweep_orphan_transcripts(root, home)
    shim_output, shim_status = _run_shim(root)

    header = (
        "## Alexandria (Cursor sessionStart)\n\n"
        f"- injected_at: {_utc_now()}\n"
        f"- session_id: {session_id}\n"
        f"- is_background_agent: {is_bg}\n"
        f"- composer_mode: {composer_mode}\n"
        f"- agent_source: {agent_path}\n"
        f"- derivative_status: constitution={constitution_status}, marginalia={marginalia_status}\n"
        f"- shim_chain: {shim_status}\n"
        f"- context_budget_chars: {max_chars}\n\n"
        "Session transcripts are captured automatically and flushed to the vault at "
        "session end. Repo-local CLAUDE.md / AGENTS.md wins on project facts; this "
        "block wins on the Author's own preferences and principles.\n\n---\n\n"
    )

    sections: list[tuple[str, str, bool]] = []

    if agent_path.is_file():
        agent_text = _read_or_note(agent_path, "Alexandria agent.md")
        if _is_untouched_template(agent_text):
            # Still the shipped stub — a one-line note beats injecting an
            # empty scaffold as if it were the Author's preferences.
            sections.append(
                (
                    "Author preferences (`agent.md`)",
                    (
                        f"(agent.md at `{agent_path}` is still the untouched starter "
                        "template — nothing to inject yet. It fills in as the Author "
                        "states operating preferences.)\n"
                    ),
                    True,
                )
            )
        else:
            sections.append(("Author preferences (`agent.md`)", agent_text, True))
    else:
        sections.append(
            (
                "Author preferences (`agent.md`)",
                (
                    f"(Alexandria agent.md not found at `{agent_path}`. "
                    "Set `ALEXANDRIA_ROOT` or clone `~/alexandria`.)\n"
                ),
                True,
            )
        )

    if shim_status == "ok":
        # The full payload chain ran — canon notices, drift, maintenance,
        # onboarding, the Author-context pointer. This IS the product's
        # session-start; inject it whole.
        if shim_output.strip():
            sections.append(("Alexandria session start (payload chain)", shim_output, True))
    else:
        # Fallback: shim missing/failed/timed out. Local-only injection so a
        # degraded install still gets context — and say plainly what's off so
        # the Engine can surface it (awareness beats silent degradation).
        sections.append(
            (
                "Payload chain unavailable",
                (
                    f"(The signed shim -> payload chain did not run: {shim_status}. "
                    "Canon update notices, drift checks, git sync, and protocol calls "
                    "were skipped this session. Falling back to local context. "
                    "If this persists, re-run: curl -fsSL alexandria-library.com/a | bash)\n"
                ),
                True,
            )
        )
        block_path = root / "system" / ".block"
        block_complete = root / "system" / ".block_complete"
        if block_path.is_file() and not block_complete.is_file():
            sections.append(
                (
                    "Onboarding pending (`system/.block`)",
                    (
                        "New Author. First impression. The full onboarding lives at "
                        f"`{block_path}` — read it now and follow it end-to-end (tell the "
                        "Author you're starting; they can step away). Do not run a normal "
                        f"/a on an empty constitution. When it completes, create "
                        f"`{block_complete}` so this notice retires.\n"
                    ),
                    True,
                )
            )
        if include_derivatives:
            if constitution_derivative.is_file():
                sections.append(
                    (
                        "Constitution derivative (`files/constitution/_constitution.md`)",
                        _read_or_note(constitution_derivative, "constitution derivative"),
                        False,
                    )
                )
            if marginalia_file.is_file():
                sections.append(
                    (
                        "Marginalia (`files/marginalia/marginalia.md`)",
                        _read_or_note(marginalia_file, "marginalia"),
                        False,
                    )
                )

    if include_overlay and overlay.is_file():
        sections.append(
            (
                "Session overlay (`~/.alexandria/inject/session-start.md`)",
                _read_or_note(overlay, "session overlay"),
                False,
            )
        )

    required_sections: list[tuple[str, str]] = []
    optional_sections: list[tuple[str, str]] = []
    for title, body, required in sections:
        block = f"## {title}\n\n{body}\n\n---\n\n"
        if required:
            required_sections.append((title, block))
        else:
            optional_sections.append((title, block))

    context_parts: list[str] = [header]
    included_sections: list[str] = []
    truncated_sections: list[str] = []
    skipped_sections: list[str] = []
    used = len(header)

    # Required sections always get first claim on the budget.
    for title, block in required_sections:
        remaining = max_chars - used
        if remaining <= 0:
            skipped_sections.append(title)
            continue
        if len(block) <= remaining:
            context_parts.append(block)
            included_sections.append(title)
            used += len(block)
            continue
        truncated_block, _ = _truncate(block, remaining)
        if truncated_block:
            context_parts.append(truncated_block)
            included_sections.append(title)
            truncated_sections.append(title)
            used += len(truncated_block)
        else:
            skipped_sections.append(title)

    # Optional sections are budgeted fairly so later sections are not starved.
    for idx, (title, block) in enumerate(optional_sections):
        remaining = max_chars - used
        if remaining <= 0:
            skipped_sections.append(title)
            continue
        remaining_optional = len(optional_sections) - idx
        fair_cap = remaining if remaining_optional <= 1 else max(1200, remaining // remaining_optional)
        if len(block) <= fair_cap:
            context_parts.append(block)
            included_sections.append(title)
            used += len(block)
            continue
        truncated_block, was_truncated = _truncate(block, fair_cap)
        if truncated_block:
            context_parts.append(truncated_block)
            included_sections.append(title)
            used += len(truncated_block)
            if was_truncated:
                truncated_sections.append(title)
        else:
            skipped_sections.append(title)

    context = "".join(context_parts)
    timestamp = _utc_now()

    try:
        _append_jsonl(
            home / ".alexandria" / "logs" / "cursor-session-start.jsonl",
            {
                "ts": timestamp,
                "hook": "sessionStart",
                "cursor_project_dir": os.environ.get("CURSOR_PROJECT_DIR"),
                "session_id": session_id,
                "is_background_agent": is_bg,
                "composer_mode": composer_mode,
                "agent_source": str(agent_path),
                "shim_status": shim_status,
                "shim_output_chars": len(shim_output),
                "orphan_transcripts_swept": swept,
                "included_sections": included_sections,
                "truncated_sections": truncated_sections,
                "skipped_sections": skipped_sections,
                "context_budget_chars": max_chars,
                "context_chars": len(context),
            },
        )
    except OSError:
        # Logging must never block context injection.
        pass

    _emit(
        {
            "env": {
                "ALEXANDRIA_ROOT": str(root),
                "ALEXANDRIA_AGENT_MD": str(agent_path),
                "ALEXANDRIA_CONSTITUTION_DERIVATIVE": str(constitution_derivative),
                "ALEXANDRIA_MARGINALIA_FILE": str(marginalia_file),
                "ALEXANDRIA_SESSION_ID": session_id,
                "ALEXANDRIA_BACKGROUND": "1" if is_bg else "0",
                "ALEXANDRIA_COMPOSER_MODE": composer_mode,
                "ALEXANDRIA_SESSION_CONTEXT_MAX_CHARS": str(max_chars),
            },
            "additional_context": context,
        }
    )


def main() -> None:
    try:
        _run()
    except Exception:
        traceback.print_exc(file=sys.stderr)
        _emit(
            {
                "additional_context": (
                    "(Alexandria sessionStart hook crashed; stderr has the traceback. "
                    "Load `~/alexandria/files/core/agent.md` manually.)\n"
                ),
                "env": {},
            }
        )


if __name__ == "__main__":
    main()
