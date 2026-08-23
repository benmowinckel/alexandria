#!/usr/bin/env python3
"""Report the ground-truth state of an Author's capture intake.

One capture is extracted when there is either a rich analysis sidecar, a stem
in ``saved/.drained`` for a ledger-only verdict, or exact legacy evidence in
the ledger itself.  Every surface uses this helper so the statusline, /a gate,
and resolver cannot disagree about whether work is still owed.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import asdict, dataclass
from pathlib import Path


URL_RE = re.compile(r"https://[^\s)>\]}]+")


@dataclass(frozen=True)
class CaptureState:
    pending_count: int
    raw_count: int
    pending: list[str]
    pending_paths: list[str]
    raw: list[str]
    processed_by_analysis: int
    processed_by_drained: int
    processed_by_legacy_ledger: int


def _alexandria_home() -> Path:
    configured = os.environ.get("ALEXANDRIA_HOME")
    return Path(configured).expanduser() if configured else Path.home() / "alexandria"


def _drained_stems(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return {
        line.strip()
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def _legacy_ledger_match(capture: Path, ledger: str) -> bool:
    """Recognize pre-.drained verdicts without guessing from filenames."""
    if not ledger:
        return False
    if capture.stem in ledger:
        return True
    body = capture.read_text(encoding="utf-8", errors="replace")
    return any(url in ledger for url in URL_RE.findall(body))


def _capture_sources(resolved: Path, saved: Path) -> list[Path]:
    """Return every source markdown, including sources already moved to saved."""
    sources: dict[str, Path] = {}
    for directory in (resolved, saved):
        if not directory.exists():
            continue
        for path in sorted(directory.glob("*.md")):
            name = path.name
            if name.startswith(".") or name == "ledger.md" or name.endswith(".analysis.md"):
                continue
            sources.setdefault(path.stem, path)
    return [sources[stem] for stem in sorted(sources)]


def inspect(root: Path | None = None) -> CaptureState:
    alexandria = root or _alexandria_home()
    resolved = alexandria / "files/vault/_input"
    saved = alexandria / "files/vault/saved"
    raw_dir = alexandria / "files/vault/input"
    ledger_path = saved / "ledger.md"
    ledger = ledger_path.read_text(encoding="utf-8", errors="replace") if ledger_path.exists() else ""
    drained = _drained_stems(saved / ".drained")

    pending: list[str] = []
    pending_paths: list[str] = []
    by_analysis = 0
    by_drained = 0
    by_legacy = 0
    for capture in _capture_sources(resolved, saved):
        stem = capture.stem
        if (saved / f"{stem}.analysis.md").exists():
            by_analysis += 1
        elif stem in drained:
            by_drained += 1
        elif _legacy_ledger_match(capture, ledger):
            by_legacy += 1
        else:
            pending.append(stem)
            pending_paths.append(str(capture.relative_to(alexandria)))

    raw = []
    if raw_dir.exists():
        raw = sorted(
            item.name
            for item in raw_dir.iterdir()
            if item.is_file() and not item.name.startswith(".")
        )

    return CaptureState(
        pending_count=len(pending),
        raw_count=len(raw),
        pending=pending,
        pending_paths=pending_paths,
        raw=raw,
        processed_by_analysis=by_analysis,
        processed_by_drained=by_drained,
        processed_by_legacy_ledger=by_legacy,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="print the complete state as JSON")
    parser.add_argument("--counts", action="store_true", help="print pending and raw counts, tab-separated")
    parser.add_argument("--gate", action="store_true", help="exit 2 while extraction work remains")
    args = parser.parse_args()

    state = inspect()
    if args.json:
        print(json.dumps(asdict(state), indent=2))
    elif args.counts:
        print(f"{state.pending_count}\t{state.raw_count}")
    else:
        print(f"pending={state.pending_count} raw={state.raw_count}")
    if args.gate and (state.pending_count or state.raw_count):
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
