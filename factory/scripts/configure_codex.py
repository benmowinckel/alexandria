#!/usr/bin/env python3
"""Merge Alexandria into Codex without replacing the user's configuration."""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import re
import shlex
import tomllib
from pathlib import Path


MARKER_START = "<!-- alexandria:start -->"
MARKER_END = "<!-- alexandria:end -->"


def is_author_managed_agents(text: str) -> bool:
    """Recognise the full local Author instructions and never splice into them."""
    return text.startswith(
        "# Synced from ~/alexandria/files/core/agent.md — edit there, not here.\n"
    ) and "\n## Alexandria the product — always running\n" in text


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


def entry_commands(entry: object) -> set[str]:
    if not isinstance(entry, dict):
        return set()
    nested = entry.get("hooks", [])
    if not isinstance(nested, list):
        return set()
    return {
        hook["command"]
        for hook in nested
        if isinstance(hook, dict) and isinstance(hook.get("command"), str)
    }


def is_alexandria_hook(entry: object, runtime_dir: Path) -> bool:
    owned_markers = (
        str(runtime_dir / "hooks" / "shim.sh").replace("\\", "/") + " ",
        str(runtime_dir / "scripts" / "capture_resolver.py").replace("\\", "/") + " ",
        "/.local/share/alexandria/hooks/shim.sh ",
        "/.local/share/alexandria/scripts/capture_resolver.py ",
        "/alexandria/system/hooks/shim.sh ",
        "/alexandria/system/scripts/capture_resolver.py ",
    )
    return any(
        marker in command.replace("\\", "/")
        for command in entry_commands(entry)
        for marker in owned_markers
    )


def clean_event(
    hooks: dict[str, object], event: str, runtime_dir: Path
) -> list[object]:
    value = hooks.get(event, [])
    if not isinstance(value, list):
        return []
    return [entry for entry in value if not is_alexandria_hook(entry, runtime_dir)]


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
        "SessionStart": clean_event(hooks, "SessionStart", runtime_dir)
        + [
            hook_entry(
                f"bash {shim_arg} session-start",
                60,
                statusMessage="Alexandria session start",
                additionalContextLimit=200000,
            ),
            hook_entry(f"python3 {resolver_arg} 2>/dev/null || true", 10),
        ],
        "SessionEnd": clean_event(hooks, "SessionEnd", runtime_dir)
        + [hook_entry(f"bash {shim_arg} codex-session-end", 3)],
        "SubagentStart": clean_event(hooks, "SubagentStart", runtime_dir)
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


def merge_agents(
    codex_home: Path,
    ambient_file: Path,
    runtime_dir: Path,
    previous_manifest: Path | None = None,
) -> str:
    agents_file = codex_home / "AGENTS.md"
    old = agents_file.read_text(encoding="utf-8") if agents_file.exists() else ""
    receipt = runtime_dir / ".codex_agents_block_sha"

    if is_author_managed_agents(old):
        return "authoritative"

    start_count = old.count(MARKER_START)
    end_count = old.count(MARKER_END)
    if start_count != end_count or start_count > 1:
        raise SystemExit("refusing to alter AGENTS.md: ambiguous Alexandria marker block")

    before, marker, rest = old.partition(MARKER_START)
    if marker:
        _, end, after = rest.partition(MARKER_END)
        existing_block = (MARKER_START + rest.partition(MARKER_END)[0] + MARKER_END).strip()
        try:
            recorded = receipt.read_text(encoding="utf-8").strip()
        except OSError:
            recorded = ""
        existing_digest = hashlib.sha256(existing_block.encode("utf-8")).hexdigest()
        if not recorded:
            legacy_digest = ""
            if previous_manifest and previous_manifest.is_file():
                try:
                    for line in previous_manifest.read_text(encoding="utf-8").splitlines():
                        digest, separator, path = line.partition("  ")
                        if separator and path == "factory/skills/codex-ambient.md":
                            legacy_digest = digest
                            break
                except OSError:
                    legacy_digest = ""
            if existing_digest != legacy_digest:
                raise SystemExit(
                    "refusing to alter AGENTS.md: marker block has no protected receipt"
                )
        elif existing_digest != recorded:
            raise SystemExit(
                "refusing to alter AGENTS.md: marker block does not match its protected receipt"
            )
        old = (before.rstrip() + "\n\n" + after.lstrip()).strip()

    ambient = ambient_file.read_text(encoding="utf-8").strip()
    merged = ((old.rstrip() + "\n\n") if old.strip() else "") + ambient + "\n"
    if merged != (agents_file.read_text(encoding="utf-8") if agents_file.exists() else ""):
        agents_file.parent.mkdir(parents=True, exist_ok=True)
        receipt.parent.mkdir(parents=True, exist_ok=True)
        receipt.write_text(
            hashlib.sha256(ambient.encode("utf-8")).hexdigest() + "\n",
            encoding="utf-8",
        )
        agents_file.write_text(merged, encoding="utf-8")
        return "merged"
    if not receipt.is_file():
        receipt.parent.mkdir(parents=True, exist_ok=True)
        receipt.write_text(
            hashlib.sha256(ambient.encode("utf-8")).hexdigest() + "\n",
            encoding="utf-8",
        )
    return "unchanged"


def validate_install(codex_home: Path, alex_dir: Path, runtime_dir: Path) -> None:
    """Parse the finished Codex files and prove the exact integration is present."""
    hook_file = codex_home / "hooks.json"
    try:
        document = json.loads(hook_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise SystemExit(f"Codex health check cannot parse hooks.json: {exc}") from exc
    hooks = document.get("hooks") if isinstance(document, dict) else None
    if not isinstance(hooks, dict):
        raise SystemExit("Codex health check: hooks is not an object")

    def commands(event: str) -> set[str]:
        entries = hooks.get(event)
        if not isinstance(entries, list):
            raise SystemExit(f"Codex health check: {event} is not an array")
        found: set[str] = set()
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            nested = entry.get("hooks", [])
            if not isinstance(nested, list):
                continue
            for hook in nested:
                if isinstance(hook, dict) and isinstance(hook.get("command"), str):
                    found.add(hook["command"])
        return found

    shim = shlex.quote(str(runtime_dir / "hooks" / "shim.sh"))
    resolver = shlex.quote(str(runtime_dir / "scripts" / "capture_resolver.py"))
    required = {
        "SessionStart": [
            hook_entry(
                f"bash {shim} session-start",
                60,
                statusMessage="Alexandria session start",
                additionalContextLimit=200000,
            ),
            hook_entry(f"python3 {resolver} 2>/dev/null || true", 10),
        ],
        "SessionEnd": [hook_entry(f"bash {shim} codex-session-end", 3)],
        "SubagentStart": [hook_entry(f"bash {shim} subagent")],
    }
    for event, expected_entries in required.items():
        entries = hooks.get(event)
        if not isinstance(entries, list) or any(
            expected not in entries for expected in expected_entries
        ):
            raise SystemExit(f"Codex health check: exact {event} hook missing")

    agents_file = codex_home / "AGENTS.md"
    try:
        agents = agents_file.read_text(encoding="utf-8")
    except OSError as exc:
        raise SystemExit(f"Codex health check cannot read AGENTS.md: {exc}") from exc
    if not is_author_managed_agents(agents):
        if agents.count(MARKER_START) != 1 or agents.count(MARKER_END) != 1:
            raise SystemExit("Codex health check: Alexandria instruction block missing")
        _, _, block_and_after = agents.partition(MARKER_START)
        block_body, _, _ = block_and_after.partition(MARKER_END)
        block = (MARKER_START + block_body + MARKER_END).strip()
        receipt_file = runtime_dir / ".codex_agents_block_sha"
        try:
            receipt = receipt_file.read_text(encoding="utf-8").strip()
        except OSError as exc:
            raise SystemExit(f"Codex health check cannot read instruction receipt: {exc}") from exc
        if hashlib.sha256(block.encode("utf-8")).hexdigest() != receipt:
            raise SystemExit("Codex health check: instruction block does not match its receipt")

    config_file = codex_home / "config.toml"
    try:
        config_text = config_file.read_text(encoding="utf-8")
        parsed_config = tomllib.loads(config_text)
    except (OSError, tomllib.TOMLDecodeError) as exc:
        raise SystemExit(f"Codex health check cannot read config.toml: {exc}") from exc
    sandbox = parsed_config.get("sandbox_workspace_write")
    roots = sandbox.get("writable_roots") if isinstance(sandbox, dict) else None
    expected_root = str(alex_dir.expanduser().resolve())
    if (
        not isinstance(roots, list)
        or not all(isinstance(root, str) for root in roots)
        or expected_root not in roots
    ):
        raise SystemExit("Codex health check: exact Alexandria writable root missing")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--codex-home", type=Path, required=True)
    parser.add_argument("--alex-dir", type=Path, required=True)
    parser.add_argument("--runtime-dir", type=Path, required=True)
    parser.add_argument("--ambient", type=Path, required=True)
    parser.add_argument("--previous-manifest", default="")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    if args.check:
        validate_install(args.codex_home, args.alex_dir, args.runtime_dir)
        print(json.dumps({"valid": True}))
        return 0

    hooks_changed, changed_events = merge_hooks(
        args.codex_home, args.alex_dir, args.runtime_dir
    )
    previous_manifest = Path(args.previous_manifest) if args.previous_manifest else None
    agents_state = merge_agents(
        args.codex_home, args.ambient, args.runtime_dir, previous_manifest
    )
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
