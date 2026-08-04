#!/usr/bin/env python3
"""Merge Alexandria into Codex without replacing the user's configuration."""

from __future__ import annotations

import argparse
import json
import shlex
from pathlib import Path


MARKER_START = "<!-- alexandria:start -->"
MARKER_END = "<!-- alexandria:end -->"
FULL_ALEXANDRIA_SENTINELS = (
    "Alexandria the product — always running",
    "Synced from ~/alexandria/files/core/agent.md",
)


def is_alexandria_hook(entry: object) -> bool:
    rendered = json.dumps(entry, sort_keys=True).lower()
    if "alexandria" not in rendered:
        return False
    return "capture_resolver.py" in rendered or (
        "shim.sh" in rendered
        and any(
            mode in rendered
            for mode in (
                " session-start",
                " session-end",
                " codex-session-end",
                " subagent",
            )
        )
    )


def clean_event(hooks: dict[str, object], event: str) -> list[object]:
    value = hooks.get(event, [])
    if not isinstance(value, list):
        return []
    return [entry for entry in value if not is_alexandria_hook(entry)]


def hook_entry(command: str, timeout: int | None = None, **extra: object) -> dict[str, object]:
    command_hook: dict[str, object] = {"type": "command", "command": command, **extra}
    if timeout is not None:
        command_hook["timeout"] = timeout
    return {"hooks": [command_hook]}


def merge_hooks(codex_home: Path, alex_dir: Path) -> tuple[bool, set[str]]:
    hook_file = codex_home / "hooks.json"
    if hook_file.exists():
        try:
            document = json.loads(hook_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            raise SystemExit(f"refusing to replace unreadable Codex hooks: {exc}") from exc
    else:
        document = {}
    if not isinstance(document, dict):
        raise SystemExit("refusing to replace Codex hooks: top level is not an object")
    hooks = document.get("hooks")
    if hooks is None:
        hooks = {}
        document["hooks"] = hooks
    elif not isinstance(hooks, dict):
        raise SystemExit("refusing to replace Codex hooks: hooks is not an object")

    shim = alex_dir / "system" / "hooks" / "shim.sh"
    resolver = alex_dir / "system" / "scripts" / "capture_resolver.py"
    shim_arg = shlex.quote(str(shim))
    resolver_arg = shlex.quote(str(resolver))
    desired = {
        "SessionStart": clean_event(hooks, "SessionStart")
        + [
            hook_entry(
                f"bash {shim_arg} session-start",
                60,
                statusMessage="Alexandria session start",
                additionalContextLimit=200000,
            ),
            hook_entry(f"python3 {resolver_arg} 2>/dev/null || true", 10),
        ],
        "SessionEnd": clean_event(hooks, "SessionEnd")
        + [hook_entry(f"bash {shim_arg} codex-session-end", 3)],
        "SubagentStart": clean_event(hooks, "SubagentStart")
        + [hook_entry(f"bash {shim_arg} subagent")],
    }

    changed_events = {
        event for event, entries in desired.items() if hooks.get(event) != entries
    }
    for event, entries in desired.items():
        hooks[event] = entries

    rendered = json.dumps(document, indent=2) + "\n"
    old = hook_file.read_text(encoding="utf-8") if hook_file.exists() else ""
    changed = old != rendered
    if changed:
        hook_file.parent.mkdir(parents=True, exist_ok=True)
        hook_file.write_text(rendered, encoding="utf-8")

    marker_names = {
        "SessionStart": "session_start",
        "SessionEnd": "session_end",
        "SubagentStart": "subagent_start",
    }
    system_dir = alex_dir / "system"
    system_dir.mkdir(parents=True, exist_ok=True)
    for event in changed_events:
        stem = marker_names[event]
        (system_dir / f".codex_{stem}_ok").unlink(missing_ok=True)
        (system_dir / f".codex_{stem}_needs_trust").write_text(
            "Codex must trust this changed Alexandria hook definition via /hooks.\n",
            encoding="utf-8",
        )
    return changed, changed_events


def merge_agents(codex_home: Path, ambient_file: Path) -> str:
    agents_file = codex_home / "AGENTS.md"
    old = agents_file.read_text(encoding="utf-8") if agents_file.exists() else ""
    if any(sentinel in old for sentinel in FULL_ALEXANDRIA_SENTINELS):
        return "existing-full"

    if (MARKER_START in old) != (MARKER_END in old):
        raise SystemExit("refusing to alter AGENTS.md: incomplete Alexandria marker block")

    before, marker, rest = old.partition(MARKER_START)
    if marker:
        _, end, after = rest.partition(MARKER_END)
        if end:
            old = (before.rstrip() + "\n\n" + after.lstrip()).strip()

    ambient = ambient_file.read_text(encoding="utf-8").strip()
    merged = ((old.rstrip() + "\n\n") if old.strip() else "") + ambient + "\n"
    if merged != (agents_file.read_text(encoding="utf-8") if agents_file.exists() else ""):
        agents_file.parent.mkdir(parents=True, exist_ok=True)
        agents_file.write_text(merged, encoding="utf-8")
        return "merged"
    return "unchanged"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--codex-home", type=Path, required=True)
    parser.add_argument("--alex-dir", type=Path, required=True)
    parser.add_argument("--ambient", type=Path, required=True)
    args = parser.parse_args()

    hooks_changed, changed_events = merge_hooks(args.codex_home, args.alex_dir)
    agents_state = merge_agents(args.codex_home, args.ambient)
    print(
        json.dumps(
            {
                "hooks_changed": hooks_changed,
                "changed_events": sorted(changed_events),
                "agents": agents_state,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
