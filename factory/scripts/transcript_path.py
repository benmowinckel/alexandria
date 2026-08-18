#!/usr/bin/env python3
"""Validate a host-supplied transcript_path before archiving it.

Supported host roots, relative to the current user's home:
  ~/.claude/  ~/.codex/  ~/.cursor/  ~/.alexandria/transcripts/  ~/.factory/

The path must be an absolute regular file owned by the current user, with no
symlink component and no path traversal. Home itself may be a symlink; only
components below the home prefix are rejected. Logical $HOME and its physical
target are both accepted so hosts that realpath the file still match.

This module is the Python check used by tests and Cursor hooks; the bash twin
is transcript_path.sh.
"""

from __future__ import annotations

import os
import stat
import sys
from pathlib import Path

HOST_ROOTS = (
    ".claude",
    ".codex",
    ".cursor",
    ".alexandria/transcripts",
    ".factory",
)


def _home_prefixes(home: Path) -> list[Path]:
    prefixes = [home]
    try:
        resolved = home.resolve()
    except OSError:
        return prefixes
    if resolved != home:
        prefixes.append(resolved)
    return prefixes


def has_symlink_component(path: Path, root: Path) -> bool:
    try:
        relative = path.relative_to(root)
    except ValueError:
        return True
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            return True
    return False


def is_safe_transcript_path(raw: str, home: Path | None = None) -> bool:
    if not raw or any(ch in raw for ch in ("\x00", "\r", "\n")):
        return False
    path = Path(raw)
    if not path.is_absolute():
        return False
    if ".." in path.parts:
        return False
    home = Path(home or Path.home())
    if not home.is_absolute():
        return False
    prefix = None
    for candidate in _home_prefixes(home):
        try:
            path.relative_to(candidate)
        except ValueError:
            continue
        if has_symlink_component(path, candidate):
            return False
        prefix = candidate
        break
    if prefix is None:
        return False
    try:
        info = path.lstat()
    except OSError:
        return False
    if not stat.S_ISREG(info.st_mode):
        return False
    if info.st_uid != os.getuid():
        return False
    rel = path.relative_to(prefix).as_posix()
    return any(rel.startswith(root + "/") for root in HOST_ROOTS)


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args[0] in {"-h", "--help"}:
        print("usage: transcript_path.py --check PATH", file=sys.stderr)
        return 2
    if args[0] == "--check":
        args = args[1:]
    if len(args) != 1:
        print("usage: transcript_path.py --check PATH", file=sys.stderr)
        return 2
    return 0 if is_safe_transcript_path(args[0]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
