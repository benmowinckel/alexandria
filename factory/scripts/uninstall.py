#!/usr/bin/env python3
"""Remove only Alexandria-owned integrations; keep the Author's files by default."""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


HOME = Path.home()
ALEX_DIR = HOME / "alexandria"
RUNTIME_DIR = HOME / ".local/share/alexandria"
MARKER_START = "<!-- alexandria:start -->"
MARKER_END = "<!-- alexandria:end -->"


def write_text_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o600
    fd, name = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.chmod(name, mode)
        os.replace(name, path)
    finally:
        try:
            os.unlink(name)
        except FileNotFoundError:
            pass


def edit_json(path: Path, label: str, editor) -> bool:
    if not path.exists():
        return True
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"left {label} unchanged: cannot parse it safely ({exc})")
        return False
    if not isinstance(document, dict):
        print(f"left {label} unchanged: top level is not an object")
        return False
    changed = editor(document)
    if changed:
        write_text_atomic(path, json.dumps(document, indent=2) + "\n")
    return True


def remove_hook_entries(hooks: object, predicate) -> bool:
    if hooks is None:
        return False
    if not isinstance(hooks, dict):
        raise ValueError("hooks is not an object")
    changed = False
    for event, entries in list(hooks.items()):
        if not isinstance(entries, list):
            continue
        kept = [entry for entry in entries if not predicate(entry)]
        if kept != entries:
            hooks[event] = kept
            changed = True
    return changed


def mentions_alexandria_hook(entry: object) -> bool:
    text = json.dumps(entry, sort_keys=True).lower()
    return "alexandria" in text and ("shim.sh" in text or "capture_resolver" in text)


def edit_claude(document: dict) -> bool:
    changed = remove_hook_entries(document.get("hooks"), mentions_alexandria_hook)
    status_line = document.get("statusLine")
    owned_status_lines = (
        {
            "type": "command",
            "command": "bash $HOME/.local/share/alexandria/scripts/statusline.sh",
        },
        {
            "type": "command",
            "command": f"bash {RUNTIME_DIR}/scripts/statusline.sh",
        },
        {
            "type": "command",
            "command": "bash $HOME/alexandria/system/scripts/statusline.sh",
        },
        {
            "type": "command",
            "command": f"bash {ALEX_DIR}/system/scripts/statusline.sh",
        },
    )
    if status_line in owned_status_lines:
        del document["statusLine"]
        changed = True
    permissions = document.get("permissions")
    if isinstance(permissions, dict):
        roots = permissions.get("additionalDirectories")
        if isinstance(roots, list):
            target = str(ALEX_DIR)
            kept = [root for root in roots if root != target]
            if kept != roots:
                permissions["additionalDirectories"] = kept
                changed = True
    return changed


CURSOR_HOOKS = (
    "alexandria-session-start.py",
    "alexandria-session-end.py",
    "alexandria-stop.py",
    "alexandria-transcript.py",
)


def edit_cursor(document: dict) -> bool:
    def owned(entry: object) -> bool:
        text = json.dumps(entry, sort_keys=True).lower()
        return any(name in text for name in CURSOR_HOOKS)

    return remove_hook_entries(document.get("hooks"), owned)


def edit_codex_hooks(document: dict) -> bool:
    return remove_hook_entries(document.get("hooks"), mentions_alexandria_hook)


def remove_codex_agents_block(path: Path) -> bool:
    if not path.exists():
        return True
    text = path.read_text(encoding="utf-8")
    if (MARKER_START in text) != (MARKER_END in text):
        print("left Codex AGENTS.md unchanged: Alexandria marker block is incomplete")
        return False
    if MARKER_START not in text:
        return True
    before, _, rest = text.partition(MARKER_START)
    _, _, after = rest.partition(MARKER_END)
    merged = (before.rstrip() + ("\n\n" if before.strip() and after.strip() else "") + after.lstrip()).rstrip()
    write_text_atomic(path, merged + ("\n" if merged else ""))
    return True


def array_end(lines: list[str], start: int) -> int:
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
    raise ValueError("unterminated writable_roots array")


def remove_codex_writable_root(path: Path) -> bool:
    if not path.exists():
        return True
    old = path.read_text(encoding="utf-8")
    lines = old.splitlines(keepends=True)
    header = re.compile(r"^\s*\[([^\[\]]+)\]\s*(?:#.*)?$")
    section_start: int | None = None
    section_end = len(lines)
    for index, line in enumerate(lines):
        match = header.match(line.rstrip("\r\n"))
        if not match:
            continue
        if section_start is not None:
            section_end = index
            break
        if match.group(1).strip() == "sandbox_workspace_write":
            section_start = index
    if section_start is None:
        return True
    key_start = next(
        (i for i in range(section_start + 1, section_end) if re.match(r"^\s*writable_roots\s*=", lines[i])),
        None,
    )
    if key_start is None:
        return True
    try:
        key_end = array_end(lines, key_start)
        assignment = "".join(lines[key_start : key_end + 1])
        roots = ast.literal_eval(assignment.split("=", 1)[1].strip())
    except (SyntaxError, ValueError) as exc:
        print(f"left Codex config unchanged: cannot parse writable_roots safely ({exc})")
        return False
    if not isinstance(roots, list) or not all(isinstance(item, str) for item in roots):
        print("left Codex config unchanged: writable_roots is not a string array")
        return False
    target = str(ALEX_DIR.resolve())
    kept = [root for root in roots if root != target]
    if kept == roots:
        return True
    lines[key_start : key_end + 1] = ["writable_roots = " + json.dumps(kept) + "\n"]
    write_text_atomic(path, "".join(lines))
    return True


def remove_owned_tree(path: Path, marker: str = "SKILL.md") -> None:
    proof = path / marker
    if not proof.is_file():
        return
    try:
        owned = "alexandria" in proof.read_text(encoding="utf-8", errors="ignore").lower()
    except OSError:
        owned = False
    if owned:
        proof.unlink()
        metadata = path / "agents/openai.yaml"
        if metadata.is_file() and "alexandria" in metadata.read_text(
            encoding="utf-8", errors="ignore"
        ).lower():
            metadata.unlink()
        for directory in (path / "agents", path):
            try:
                directory.rmdir()
            except OSError:
                pass
    else:
        print(f"kept foreign file: {path}")


def remove_owned_file(path: Path) -> None:
    if not path.is_file():
        return
    if "alexandria" in path.read_text(encoding="utf-8", errors="ignore").lower():
        path.unlink()
    else:
        print(f"kept foreign file: {path}")


def remove_jobs() -> None:
    for name in ("io.alexandria.icloud-backup.plist", "io.alexandria.drive-sync.plist"):
        path = HOME / "Library/LaunchAgents" / name
        if path.exists():
            subprocess.run(["launchctl", "unload", str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            path.unlink(missing_ok=True)


def remove_owned_allowed_signer() -> bool:
    marker = ALEX_DIR / "system/.allowed_signers_entry"
    if not marker.is_file():
        return True
    try:
        owned_line = marker.read_text(encoding="utf-8").rstrip("\r\n")
        configured = subprocess.run(
            ["git", "-C", str(ALEX_DIR), "config", "gpg.ssh.allowedSignersFile"],
            check=False,
            capture_output=True,
            text=True,
        ).stdout.strip()
        path = Path(configured).expanduser() if configured else HOME / ".config/git/allowed_signers"
        if path.is_file() and owned_line:
            lines = path.read_text(encoding="utf-8").splitlines()
            kept = [line for line in lines if line != owned_line]
            if kept != lines:
                write_text_atomic(path, "\n".join(kept) + ("\n" if kept else ""))
        marker.unlink(missing_ok=True)
        return True
    except OSError as exc:
        print(f"left the Git allowed-signers entry unchanged: {exc}")
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Remove Alexandria integrations safely")
    parser.add_argument(
        "--delete-files",
        action="store_true",
        help="also delete ~/alexandria after disconnecting it; your remote backups remain",
    )
    args = parser.parse_args()
    ok = True

    for path, label, editor in (
        (HOME / ".claude/settings.json", "Claude settings", edit_claude),
        (HOME / ".cursor/hooks.json", "Cursor hooks", edit_cursor),
        (HOME / ".codex/hooks.json", "Codex hooks", edit_codex_hooks),
    ):
        try:
            ok = edit_json(path, label, editor) and ok
        except ValueError as exc:
            print(f"left {label} unchanged: {exc}")
            ok = False

    ok = remove_codex_agents_block(HOME / ".codex/AGENTS.md") and ok
    ok = remove_codex_writable_root(HOME / ".codex/config.toml") and ok
    ok = remove_owned_allowed_signer() and ok

    for base in (HOME / ".claude/skills", HOME / ".cursor/skills", HOME / ".agents/skills"):
        for name in ("a", "a.", "alexandria", "alexandria-close"):
            remove_owned_tree(base / name)
    remove_owned_tree(HOME / ".claude/scheduled-tasks/alexandria", marker="SKILL.md")

    for path in (
        HOME / ".cursor/rules/alexandria.mdc",
        *(HOME / ".cursor/hooks" / name for name in CURSOR_HOOKS),
        HOME / ".factory/droids/a.md",
        HOME / ".factory/droids/alexandria.md",
    ):
        remove_owned_file(path)

    sidecar = HOME / ".alexandria"
    if sidecar.is_dir():
        shutil.rmtree(sidecar)
    remove_jobs()

    # Remove both the protected runtime and exact legacy runtime files. Author
    # cognition remains under ~/alexandria unless --delete-files was requested.
    for legacy in (
        ALEX_DIR / "system/hooks/shim.sh",
        ALEX_DIR / "system/.hooks_payload",
        ALEX_DIR / "system/.payload_verified_sha",
        ALEX_DIR / "system/allowed_signers",
        ALEX_DIR / "system/.canon_manifest",
        ALEX_DIR / "system/.factory_version",
        ALEX_DIR / "system/.setup_complete",
        ALEX_DIR / "system/scripts/capture_resolver.py",
        ALEX_DIR / "system/scripts/configure_codex.py",
        ALEX_DIR / "system/scripts/uninstall.py",
        ALEX_DIR / "system/scripts/statusline.sh",
        ALEX_DIR / "system/scripts/verify-fetch.sh",
    ):
        legacy.unlink(missing_ok=True)
    if RUNTIME_DIR.is_symlink():
        RUNTIME_DIR.unlink()
    elif RUNTIME_DIR.is_dir():
        shutil.rmtree(RUNTIME_DIR)

    if not ok:
        print("Alexandria was disconnected where it was safe to do so, but one malformed config was left unchanged.")
        return 1

    if args.delete_files:
        if ALEX_DIR.is_symlink():
            print("refusing to delete ~/alexandria because it is a symlink")
            return 1
        if ALEX_DIR.exists():
            shutil.rmtree(ALEX_DIR)
        print("Alexandria integrations and local files removed. Remote backups were left untouched.")
    else:
        print("Alexandria disconnected. Your files remain in ~/alexandria.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
