#!/usr/bin/env python3
"""Merge Alexandria into Codex without replacing the user's configuration."""

from __future__ import annotations

import argparse
import ast
import json
import re
import shlex
from pathlib import Path


MARKER_START = "<!-- alexandria:start -->"
MARKER_END = "<!-- alexandria:end -->"
FULL_ALEXANDRIA_SENTINELS = (
    "Alexandria the product — always running",
    "Synced from ~/alexandria/files/core/agent.md",
)


def _array_end(lines: list[str], start: int) -> int:
    """Return the final line of a TOML array assignment without rewriting TOML."""
    depth = 0
    quote: str | None = None
    escaped = False
    seen = False
    for index in range(start, len(lines)):
        for char in lines[index]:
            if quote:
                if quote == '"' and escaped:
                    escaped = False
                elif quote == '"' and char == "\\":
                    escaped = True
                elif char == quote:
                    quote = None
                continue
            if char in ('"', "'"):
                quote = char
            elif char == "#":
                break
            elif char == "[":
                depth += 1
                seen = True
            elif char == "]":
                depth -= 1
                if seen and depth == 0:
                    return index
    raise SystemExit("refusing to alter Codex config: unterminated writable_roots array")


def merge_writable_root(codex_home: Path, alex_dir: Path) -> str:
    """Add Alexandria as one exact writable root while preserving all other config."""
    config_file = codex_home / "config.toml"
    old = config_file.read_text(encoding="utf-8") if config_file.exists() else ""
    lines = old.splitlines(keepends=True)
    header_re = re.compile(r"^\s*\[([^\[\]]+)\]\s*(?:#.*)?$")
    section_start: int | None = None
    section_end = len(lines)
    for index, line in enumerate(lines):
        match = header_re.match(line.rstrip("\r\n"))
        if not match:
            continue
        if section_start is not None:
            section_end = index
            break
        if match.group(1).strip() == "sandbox_workspace_write":
            section_start = index

    root = str(alex_dir.expanduser().resolve())
    rendered = json.dumps(root)
    if section_start is None:
        prefix = old
        if prefix and not prefix.endswith("\n"):
            prefix += "\n"
        if prefix and not prefix.endswith("\n\n"):
            prefix += "\n"
        new = prefix + "[sandbox_workspace_write]\n" + f"writable_roots = [{rendered}]\n"
    else:
        key_start: int | None = None
        for index in range(section_start + 1, section_end):
            if re.match(r"^\s*writable_roots\s*=", lines[index]):
                key_start = index
                break
        if key_start is None:
            lines.insert(section_start + 1, f"writable_roots = [{rendered}]\n")
            new = "".join(lines)
        else:
            key_end = _array_end(lines, key_start)
            assignment = "".join(lines[key_start : key_end + 1])
            value = assignment.split("=", 1)[1].strip()
            try:
                roots = ast.literal_eval(value)
            except (SyntaxError, ValueError) as exc:
                raise SystemExit(
                    "refusing to alter Codex config: cannot safely parse writable_roots"
                ) from exc
            if not isinstance(roots, list) or not all(isinstance(item, str) for item in roots):
                raise SystemExit(
                    "refusing to alter Codex config: writable_roots is not a string array"
                )
            if root in roots:
                return "existing"
            roots.append(root)
            replacement = "writable_roots = " + json.dumps(roots) + "\n"
            lines[key_start : key_end + 1] = [replacement]
            new = "".join(lines)

    if new != old:
        config_file.parent.mkdir(parents=True, exist_ok=True)
        config_file.write_text(new, encoding="utf-8")
        return "merged"
    return "unchanged"


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


def merge_hooks(
    codex_home: Path, alex_dir: Path, runtime_dir: Path
) -> tuple[bool, set[str]]:
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

    shim = runtime_dir / "hooks" / "shim.sh"
    resolver = runtime_dir / "scripts" / "capture_resolver.py"
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
    parser.add_argument("--runtime-dir", type=Path, required=True)
    parser.add_argument("--ambient", type=Path, required=True)
    args = parser.parse_args()

    hooks_changed, changed_events = merge_hooks(
        args.codex_home, args.alex_dir, args.runtime_dir
    )
    agents_state = merge_agents(args.codex_home, args.ambient)
    writable_root_state = merge_writable_root(args.codex_home, args.alex_dir)
    print(
        json.dumps(
            {
                "hooks_changed": hooks_changed,
                "changed_events": sorted(changed_events),
                "agents": agents_state,
                "writable_root": writable_root_state,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
