#!/usr/bin/env python3
"""Render the shared start-execution contract into every supported skill."""

from __future__ import annotations

import argparse
import difflib
import os
import stat
import sys
import tempfile
from pathlib import Path


START_MARKER = "<!-- BEGIN GENERATED: start-execution -->"
END_MARKER = "<!-- END GENERATED: start-execution -->"
FRAGMENT_PATH = Path("factory/shared/start-execution.md")
SKILL_PATHS = (
    Path("factory/skills/claudecode.md"),
    Path("factory/skills/codex.md"),
    Path("factory/skills/droid.md"),
    Path("factory/skills/grok-bot.md"),
)


class RenderError(Exception):
    """The source fragment or a generated region is invalid."""


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        raise RenderError(f"cannot read {path}: {exc}") from exc


def _load_fragment(root: Path) -> str:
    path = root / FRAGMENT_PATH
    fragment = _read(path).strip("\n")
    if not fragment.strip():
        raise RenderError(f"canonical fragment is empty: {path}")
    if START_MARKER in fragment or END_MARKER in fragment:
        raise RenderError(f"canonical fragment must not contain generator markers: {path}")
    return fragment


def render_skill(current: str, fragment: str, path: Path) -> str:
    """Replace exactly one marked region while preserving the rest of a skill."""
    start_count = current.count(START_MARKER)
    end_count = current.count(END_MARKER)
    if start_count != 1 or end_count != 1:
        raise RenderError(
            f"{path}: expected exactly one start marker and one end marker; "
            f"found {start_count} start and {end_count} end"
        )

    start = current.index(START_MARKER)
    end = current.index(END_MARKER)
    if end < start:
        raise RenderError(f"{path}: end marker appears before start marker")

    content_start = start + len(START_MARKER)
    return (
        current[:content_start]
        + "\n"
        + fragment
        + "\n"
        + current[end:]
    )


def render_all(root: Path) -> dict[Path, tuple[str, str]]:
    """Validate and render every target before any file is changed."""
    fragment = _load_fragment(root)
    rendered: dict[Path, tuple[str, str]] = {}
    for relative_path in SKILL_PATHS:
        path = root / relative_path
        current = _read(path)
        rendered[path] = (current, render_skill(current, fragment, path))
    return rendered


def _atomic_write(path: Path, content: str) -> None:
    mode = stat.S_IMODE(path.stat().st_mode)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            delete=False,
        ) as temporary:
            temporary.write(content)
            temporary_path = Path(temporary.name)
        os.chmod(temporary_path, mode)
        os.replace(temporary_path, path)
    except OSError as exc:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
        raise RenderError(f"cannot write {path}: {exc}") from exc


def check(root: Path) -> int:
    rendered = render_all(root)
    drifted = False
    for path, (current, expected) in rendered.items():
        if current == expected:
            continue
        drifted = True
        relative_path = path.relative_to(root)
        print(f"generated start contract drifted: {relative_path}", file=sys.stderr)
        diff = difflib.unified_diff(
            current.splitlines(keepends=True),
            expected.splitlines(keepends=True),
            fromfile=str(relative_path),
            tofile=f"{relative_path} (rendered)",
        )
        sys.stderr.writelines(diff)
        if current and not current.endswith("\n"):
            print(file=sys.stderr)
    if drifted:
        print(
            "run factory/scripts/render_start_skills.py --write to regenerate",
            file=sys.stderr,
        )
        return 1
    print("start skills are up to date")
    return 0


def write(root: Path) -> int:
    rendered = render_all(root)
    changed: list[Path] = []
    for path, (current, expected) in rendered.items():
        if current == expected:
            continue
        _atomic_write(path, expected)
        changed.append(path.relative_to(root))
    if changed:
        print("updated " + ", ".join(str(path) for path in changed))
    else:
        print("start skills already up to date")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Render or verify the shared start-execution skill contract."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="rewrite drifted skill regions")
    mode.add_argument("--check", action="store_true", help="verify generated regions (default)")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args(argv)

    try:
        return write(args.root.resolve()) if args.write else check(args.root.resolve())
    except RenderError as exc:
        print(f"render_start_skills: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
