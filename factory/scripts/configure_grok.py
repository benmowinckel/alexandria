#!/usr/bin/env python3
"""Write Grok Build native hooks without clobbering foreign ~/.grok files.

Grok CLI discovers personal hooks from ~/.grok/hooks/*.json. Claude Code
settings.json and Cursor hooks.json are also scanned by default
([compat.claude] hooks / [compat.cursor] hooks, both on unless the Author
turns them off). This writer always installs the Grok-native file so a
Claude-less Grok user gets the loop. It does not toggle Claude or Cursor
compat globally: that would drop the Author's non-Alexandria hooks from
those hosts. If Claude or Cursor Alexandria hooks are also present, Grok
CLI may invoke the same signed shim twice in one session (documented
double-fire; the payload is meant to be safe to repeat).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


HOOK_FILE = "alexandria.json"
SHIM = "bash $HOME/.local/share/alexandria/hooks/shim.sh"
RESOLVER = (
    "python3 $HOME/.local/share/alexandria/scripts/capture_resolver.py "
    "2>/dev/null || true"
)

# Grok global hooks are always trusted (no /hooks-trust). Timeouts match
# Claude: session-start needs room for a first-run payload fetch.
REQUIRED_HOOKS = {
    "hooks": {
        "SessionStart": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": f"{SHIM} session-start",
                        "timeout": 60,
                    }
                ]
            },
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": RESOLVER,
                        "timeout": 10,
                    }
                ]
            },
        ],
        "SessionEnd": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": f"{SHIM} session-end",
                        "timeout": 15,
                    }
                ]
            },
        ],
        "SubagentStart": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": f"{SHIM} subagent",
                    }
                ]
            },
        ],
    }
}

OWNED_COMMANDS = {
    f"{SHIM} session-start",
    f"{SHIM} session-end",
    f"{SHIM} subagent",
    RESOLVER,
}


def alexandria_commands_in(document: object) -> set[str]:
    """Collect shim/resolver commands from a Claude-style or Grok-style hook doc."""
    found: set[str] = set()
    if not isinstance(document, dict):
        return found
    hooks = document.get("hooks", document)
    if not isinstance(hooks, dict):
        return found
    for entries in hooks.values():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            nested = entry.get("hooks", [entry])
            if not isinstance(nested, list):
                nested = [entry]
            for hook in nested:
                if not isinstance(hook, dict):
                    continue
                command = hook.get("command")
                if isinstance(command, str) and command in OWNED_COMMANDS:
                    found.add(command)
    return found


def claude_compat_would_duplicate(claude_settings: object) -> bool:
    """True when Claude settings already register the same shim Grok will run natively."""
    return bool(alexandria_commands_in(claude_settings) & OWNED_COMMANDS)


def write_native_hooks(grok_home: Path) -> str:
    """Write ~/.grok/hooks/alexandria.json. Refuses a foreign file at that path."""
    grok_home.mkdir(parents=True, exist_ok=True)
    hooks_dir = grok_home / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    path = hooks_dir / HOOK_FILE
    rendered = json.dumps(REQUIRED_HOOKS, indent=2) + "\n"
    if path.exists():
        try:
            current = path.read_text(encoding="utf-8")
        except OSError as exc:
            raise SystemExit(f"refusing to alter unreadable Grok hook file: {exc}") from exc
        if current == rendered:
            return "existing"
        try:
            document = json.loads(current)
        except json.JSONDecodeError as exc:
            raise SystemExit(
                f"refusing to alter unreadable Grok hook file: {exc}"
            ) from exc
        if document != REQUIRED_HOOKS:
            raise SystemExit(
                "refusing to alter Grok hook file: ~/.grok/hooks/alexandria.json "
                "is not the Alexandria-owned hook document"
            )
        if current != rendered:
            path.write_text(rendered, encoding="utf-8")
            return "merged"
        return "existing"
    path.write_text(rendered, encoding="utf-8")
    return "merged"


def check_native_hooks(grok_home: Path) -> bool:
    path = grok_home / "hooks" / HOOK_FILE
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return document == REQUIRED_HOOKS


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Install Grok Build native Alexandria hooks")
    parser.add_argument("--grok-home", required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    grok_home = Path(args.grok_home)
    if args.check:
        return 0 if check_native_hooks(grok_home) else 1
    write_native_hooks(grok_home)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
