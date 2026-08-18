#!/usr/bin/env python3
"""Remove only Alexandria-owned integrations; keep the Author's files by default."""

from __future__ import annotations

import argparse
import ast
import hashlib
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
OWNERSHIP_LEDGER = RUNTIME_DIR / ".owned_integrations"


def has_symlink_component(path: Path) -> bool:
    """Reject symlinks anywhere below HOME before any destructive write."""
    try:
        relative = path.relative_to(HOME)
    except ValueError:
        return True
    current = HOME
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            return True
    return False


def write_text_atomic(path: Path, text: str) -> None:
    if has_symlink_component(path):
        raise OSError(f"refusing symlinked path: {path}")
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
    if not isinstance(entry, dict):
        return False
    nested = entry.get("hooks", [])
    if not isinstance(nested, list):
        return False
    owned = {
        "bash $HOME/.local/share/alexandria/hooks/shim.sh session-start",
        "bash $HOME/.local/share/alexandria/hooks/shim.sh session-end",
        "bash $HOME/.local/share/alexandria/hooks/shim.sh codex-session-end",
        "bash $HOME/.local/share/alexandria/hooks/shim.sh subagent",
        f"bash {RUNTIME_DIR / 'hooks/shim.sh'} session-start",
        f"bash {RUNTIME_DIR / 'hooks/shim.sh'} session-end",
        f"bash {RUNTIME_DIR / 'hooks/shim.sh'} codex-session-end",
        f"bash {RUNTIME_DIR / 'hooks/shim.sh'} subagent",
        "python3 $HOME/.local/share/alexandria/scripts/capture_resolver.py 2>/dev/null || true",
        f"python3 {RUNTIME_DIR / 'scripts/capture_resolver.py'} 2>/dev/null || true",
    }
    return any(
        isinstance(hook, dict) and hook.get("command") in owned for hook in nested
    )


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
        return isinstance(entry, dict) and entry.get("command") in {
            "./hooks/alexandria-session-start.py",
            "./hooks/alexandria-session-end.py",
            "./hooks/alexandria-stop.py",
            "./hooks/alexandria-transcript.py beforeSubmitPrompt",
            "./hooks/alexandria-transcript.py afterAgentResponse",
        }

    return remove_hook_entries(document.get("hooks"), owned)


def edit_codex_hooks(document: dict) -> bool:
    return remove_hook_entries(document.get("hooks"), mentions_alexandria_hook)


def edit_factory_hooks(document: dict) -> bool:
    return remove_hook_entries(document, mentions_alexandria_hook)


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
    body, _, after = rest.partition(MARKER_END)
    block = (MARKER_START + body + MARKER_END).strip()
    receipt_file = RUNTIME_DIR / ".codex_agents_block_sha"
    try:
        receipt = receipt_file.read_text(encoding="utf-8").strip()
    except OSError:
        print("left Codex AGENTS.md unchanged: no protected Alexandria block receipt")
        return False
    if hashlib.sha256(block.encode("utf-8")).hexdigest() != receipt:
        print("left Codex AGENTS.md unchanged: marker block does not match its receipt")
        return False
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


def owned_file_matches(path: Path) -> bool:
    """Require the protected install receipt and the exact installed bytes."""
    if has_symlink_component(path) or not path.is_file() or not OWNERSHIP_LEDGER.is_file():
        return False
    try:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        for line in OWNERSHIP_LEDGER.read_text(encoding="utf-8").splitlines():
            recorded_path, separator, recorded_digest = line.partition("\t")
            if separator and Path(recorded_path) == path:
                return recorded_digest == digest
    except OSError:
        return False
    return False


def remove_owned_tree(path: Path, marker: str = "SKILL.md") -> None:
    proof = path / marker
    if not proof.is_file():
        return
    if owned_file_matches(proof):
        proof.unlink()
        metadata = path / "agents/openai.yaml"
        if owned_file_matches(metadata):
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
    if owned_file_matches(path):
        path.unlink()
    else:
        print(f"kept foreign file: {path}")


def remove_jobs() -> None:
    for name in ("io.alexandria.icloud-backup.plist", "io.alexandria.drive-sync.plist"):
        path = HOME / "Library/LaunchAgents" / name
        if path.exists() and owned_file_matches(path):
            subprocess.run(["launchctl", "unload", str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            path.unlink(missing_ok=True)
        elif path.exists():
            print(f"kept foreign file: {path}")


def remove_owned_allowed_signer() -> bool:
    marker = RUNTIME_DIR / ".allowed_signers_entry"
    if not marker.is_file():
        return True
    try:
        owned_line = marker.read_text(encoding="utf-8").rstrip("\r\n")
        # Setup writes only this fixed user-level file. Never let repository
        # config redirect deletion to an attacker-chosen path.
        path = HOME / ".config/git/allowed_signers"
        if has_symlink_component(path):
            print(f"left the Git allowed-signers entry unchanged: symlinked path {path}")
            return False
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


def remove_signed_runtime_files() -> None:
    """Remove only exact factory bytes; preserve receipts and unknown additions."""
    manifest = RUNTIME_DIR / ".canon_manifest"
    if RUNTIME_DIR.is_symlink():
        print(f"kept foreign runtime symlink: {RUNTIME_DIR}")
        return
    if has_symlink_component(manifest):
        print(f"kept runtime with a symlinked manifest: {RUNTIME_DIR}")
        return
    try:
        expected = {}
        for line in manifest.read_text(encoding="utf-8").splitlines():
            digest, separator, source = line.partition("  ")
            if separator:
                expected[source] = digest
    except OSError:
        print(f"kept runtime without a verified manifest: {RUNTIME_DIR}")
        return

    for path, source in (
        (RUNTIME_DIR / "hooks/shim.sh", "factory/hooks/shim.sh"),
        (RUNTIME_DIR / ".hooks_payload", "factory/hooks/payload.sh"),
        (RUNTIME_DIR / "codex-ambient.md", "factory/skills/codex-ambient.md"),
        (RUNTIME_DIR / "scripts/capture_resolver.py", "factory/scripts/capture_resolver.py"),
        (RUNTIME_DIR / "scripts/configure_codex.py", "factory/scripts/configure_codex.py"),
        (RUNTIME_DIR / "scripts/configure_grok.py", "factory/scripts/configure_grok.py"),
        (RUNTIME_DIR / "scripts/statusline.sh", "factory/scripts/statusline.sh"),
        (RUNTIME_DIR / "scripts/uninstall.py", "factory/scripts/uninstall.py"),
        (RUNTIME_DIR / "scripts/verify-fetch.sh", "factory/scripts/verify-fetch.sh"),
        (RUNTIME_DIR / "scripts/classify_install.sh", "factory/scripts/classify_install.sh"),
        (RUNTIME_DIR / "scripts/transcript_path.sh", "factory/scripts/transcript_path.sh"),
        (RUNTIME_DIR / "scripts/transcript_path.py", "factory/scripts/transcript_path.py"),
        (ALEX_DIR / "system/modules.json", "factory/module-system.json"),
    ):
        if has_symlink_component(path) or not path.is_file():
            continue
        try:
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
        except OSError:
            continue
        if expected.get(source) == actual:
            path.unlink()
        else:
            print(f"kept changed or foreign runtime file: {path}")

    for directory in (RUNTIME_DIR / "hooks", RUNTIME_DIR / "scripts"):
        try:
            directory.rmdir()
        except OSError:
            pass


def protected_config_marker(name: str) -> bool:
    marker = RUNTIME_DIR / name
    if has_symlink_component(marker):
        return False
    try:
        return marker.read_text(encoding="utf-8") == "alexandria-config-v1\n"
    except OSError:
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

    for path, label, editor, marker in (
        (HOME / ".claude/settings.json", "Claude settings", edit_claude, ".owned_claude_config"),
        (HOME / ".cursor/hooks.json", "Cursor hooks", edit_cursor, ".owned_cursor_config"),
        (HOME / ".codex/hooks.json", "Codex hooks", edit_codex_hooks, ".owned_codex_config"),
        (HOME / ".factory/hooks.json", "Factory hooks", edit_factory_hooks, ".owned_factory_config"),
    ):
        if not protected_config_marker(marker):
            if path.exists():
                print(f"left {label} unchanged: no protected Alexandria config receipt")
            continue
        try:
            ok = edit_json(path, label, editor) and ok
        except ValueError as exc:
            print(f"left {label} unchanged: {exc}")
            ok = False

    if protected_config_marker(".owned_codex_config"):
        ok = remove_codex_agents_block(HOME / ".codex/AGENTS.md") and ok
        ok = remove_codex_writable_root(HOME / ".codex/config.toml") and ok
    ok = remove_owned_allowed_signer() and ok

    for base in (
        HOME / ".claude/skills",
        HOME / ".cursor/skills",
        HOME / ".agents/skills",
        HOME / ".factory/skills",
        HOME / ".grok/skills",
    ):
        for name in ("a", "a.", "alexandria", "alexandria-close", "close-alexandria"):
            remove_owned_tree(base / name)
    remove_owned_tree(HOME / ".claude/scheduled-tasks/alexandria", marker="SKILL.md")

    for path in (
        HOME / ".cursor/rules/alexandria.mdc",
        HOME / ".cursor/rules/alexandria-loop.mdc",
        *(HOME / ".cursor/hooks" / name for name in CURSOR_HOOKS),
        HOME / ".factory/droids/a.md",
        HOME / ".factory/droids/alexandria.md",
        HOME / ".grok/hooks/alexandria.json",
    ):
        remove_owned_file(path)

    sidecar = HOME / ".alexandria"
    if sidecar.is_dir():
        # Cursor uses this shared, user-writable namespace for local transcript
        # staging and overlays. A directory name is not proof of ownership, so
        # disconnect the hooks but preserve every byte here. The user can inspect
        # and remove it separately if they know it contains only Alexandria data.
        print(f"kept local Cursor sidecar: {sidecar}")
    remove_jobs()

    # Remove legacy runtime files only when the protected receipt proves their
    # exact bytes were installed by Alexandria. A familiar path is not proof.
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
        ALEX_DIR / "system/scripts/configure_grok.py",
        ALEX_DIR / "system/scripts/uninstall.py",
        ALEX_DIR / "system/scripts/statusline.sh",
        ALEX_DIR / "system/scripts/verify-fetch.sh",
    ):
        remove_owned_file(legacy)
    remove_signed_runtime_files()

    if not ok:
        print("Alexandria was disconnected where it was safe to do so, but one malformed config was left unchanged.")
        return 1

    if args.delete_files:
        if ALEX_DIR.is_symlink():
            print("refusing to delete ~/alexandria because it is a symlink")
            return 1
        if ALEX_DIR.exists():
            shutil.rmtree(ALEX_DIR)
        print("Alexandria integrations and local files removed. Remote backups, iCloud captures, Drive copies, and the Cursor sidecar were left untouched.")
    else:
        print("Alexandria disconnected. Left in place on purpose:")
        print("  ~/alexandria/ — Author files, permission markers, local git")
        print("  ~/.alexandria/ — Cursor sidecar; a directory name is not ownership proof")
        print("  iCloud Drive/alexandria/vault/input — if you used the Shortcut")
        print("  any private Git remote, Drive folder, or launchd add-on you enabled")
        print("  foreign skills, rules, and hook entries")
        print("  ~/.grok/config.toml and any foreign ~/.grok files")
        print("User data was not deleted. Remote backups and the Alexandria account were not touched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
