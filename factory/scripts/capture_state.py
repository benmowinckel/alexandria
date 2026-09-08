#!/usr/bin/env python3
"""Report the ground-truth state of an Author's capture intake.

One capture is extracted when there is either a rich analysis sidecar, a stem
in ``saved/.drained`` for a ledger-only verdict, or exact legacy evidence in
the ledger itself.  Extraction gates retain that contract. The separate review inventory powers
human-facing counts: an analysis without a disposition still needs processing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path


URL_RE = re.compile(r"https://[^\s)>\]}]+")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
TIMESTAMP_PREFIX_RE = re.compile(r"^(\d{8}-\d{6})")


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


def _processed(capture: Path, saved: Path, ledger: str, drained: set[str]) -> str | None:
    stem = capture.stem
    if (saved / f"{stem}.analysis.md").exists():
        return "analysis"
    if stem in drained:
        return "drained"
    if _legacy_ledger_match(capture, ledger):
        return "legacy_ledger"
    return None


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
        proof = _processed(capture, saved, ledger, drained)
        if proof == "analysis":
            by_analysis += 1
        elif proof == "drained":
            by_drained += 1
        elif proof == "legacy_ledger":
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


def review(root: Path | None = None) -> dict[str, int]:
    """Count review and disposition separately from extraction proof.

    Copies join by source filename or explicit resolver provenance, never by a
    shared article URL. An analysis is not a verdict. Read errors propagate so
    callers cannot turn an unavailable inventory into a reassuring zero.
    """
    alexandria = root or _alexandria_home()
    vault = alexandria / "files/vault"
    saved = vault / "saved"
    groups: list[dict] = []

    def merge(ids: set[str], urls: set[str] | None = None) -> None:
        matches = [group for group in groups if group["ids"] & ids]
        group = {"ids": set(ids), "urls": set(urls or ())}
        for other in matches:
            group["ids"].update(other["ids"])
            group["urls"].update(other["urls"])
            groups.remove(other)
        groups.append(group)

    for capture in _capture_sources(vault / "_input", saved):
        body = capture.read_text(encoding="utf-8", errors="replace")
        ids = {"stem:" + capture.stem, "file:" + capture.name}
        for original in re.findall(r"_Recovered from `([^`]+)`\._\s*$", body):
            if Path(original).name == original:
                ids.add("file:" + original)
        # Explicit source metadata is eligible for unambiguous legacy rows.
        # Other body links may be quotations, replies or background reading.
        urls = set(re.findall(r"^(?:source|url):\s*(https://\S+)", body, re.M))
        status = re.search(r"-(\d{15,})$", capture.stem)
        if status:
            urls.update(url for url in URL_RE.findall(body)
                        if re.search(r"/status/" + status.group(1) + r"(?:[/?#]|$)", url))
        merge(ids, urls)
    raw = vault / "input"
    if raw.exists():
        for capture in sorted(raw.iterdir()):
            if capture.is_file() and not capture.name.startswith("."):
                merge({"file:" + capture.name})

    ledger_path = saved / "ledger.md"
    ledger = ledger_path.read_text(encoding="utf-8", errors="replace") if ledger_path.exists() else ""
    open_items: set[str] = set()
    disposition: set[int] = set()
    for line in ledger.splitlines():
        mark = re.match(r"^- \[([ xX-])\](?:\s|$)", line)
        if not mark:
            continue
        refs = set(re.findall(r"`([^`]+)`", line))
        # Legacy rows sometimes start with an unquoted exact stem.
        first = line[mark.end():].strip().split(maxsplit=1)
        if first and any("stem:" + first[0] in group["ids"] for group in groups):
            refs.add(first[0])
        for target in re.findall(r"\]\(([^)]+)\)", line):
            if not target.startswith(("https://", "http://")):
                refs.add(Path(target).name)
        ids: set[str] = set()
        for ref in refs:
            name = Path(ref).name
            stem = name.removesuffix(".analysis.md").removesuffix(".md")
            ids.update(("stem:" + stem, "file:" + name))
        matches = [i for i, group in enumerate(groups) if group["ids"] & ids]
        if not matches and not refs:
            urls = set(URL_RE.findall(line))
            possible = [i for i, group in enumerate(groups) if group["urls"] & urls]
            if len(possible) == 1:
                matches = possible
        disposition.update(matches)
        if mark.group(1) == " ":
            if matches:
                open_items.update("source:" + str(i) for i in matches)
            else:
                # A ledger may outlive its original. Keep its review obligation.
                key = "|".join(sorted(refs)) or re.sub(r"\s+", " ", line).strip()
                open_items.add("ledger:" + key)
    drained = _drained_stems(saved / ".drained")
    for i, group in enumerate(groups):
        if any("stem:" + stem in group["ids"] or "file:" + stem in group["ids"]
               for stem in drained):
            disposition.add(i)
    return {"review_count": len(open_items), "processing_count": len(groups) - len(disposition)}


def summary(state: dict[str, int]) -> str:
    return f"{state['review_count']} to review; {state['processing_count']} to process."


def snapshot(root: Path | None = None) -> dict[str, object]:
    """Freeze the exact work owed when an active session starts."""
    alexandria = root or _alexandria_home()
    state = inspect(alexandria)
    pending = []
    for stem, relative in zip(state.pending, state.pending_paths, strict=True):
        source = alexandria / relative
        pending.append(
            {
                "stem": stem,
                "path": relative,
                "sha256": _sha256(source),
            }
        )
    raw = []
    for name in state.raw:
        relative = f"files/vault/input/{name}"
        raw.append(
            {
                "name": name,
                "path": relative,
                "sha256": _sha256(alexandria / relative),
            }
        )
    return {"version": 1, "pending": pending, "raw": raw}


def _snapshot_item(item: object, *, kind: str) -> tuple[str, str, str]:
    if not isinstance(item, dict):
        raise ValueError(f"{kind} snapshot entry is not an object")
    identity_key = "stem" if kind == "pending" else "name"
    identity = item.get(identity_key)
    relative = item.get("path")
    digest = item.get("sha256")
    if not all(isinstance(value, str) and value for value in (identity, relative, digest)):
        raise ValueError(f"{kind} snapshot entry has missing fields")
    path = Path(relative)
    expected_parent = Path("files/vault/_input") if kind == "pending" else Path("files/vault/input")
    allowed_parents = {expected_parent}
    if kind == "pending":
        allowed_parents.add(Path("files/vault/saved"))
    if path.is_absolute() or ".." in path.parts or path.parent not in allowed_parents:
        raise ValueError(f"{kind} snapshot path is outside the capture folders: {relative}")
    if (kind == "pending" and path.stem != identity) or (
        kind == "raw" and path.name != identity
    ):
        raise ValueError(f"{kind} snapshot identity does not match its path")
    if not SHA256_RE.fullmatch(digest):
        raise ValueError(f"{kind} snapshot entry has an invalid sha256")
    return identity, path.name, digest


def _raw_processing_proof(
    raw_source: Path,
    raw_name: str,
    resolved: Path,
    saved: Path,
    ledger: str,
    drained: set[str],
) -> bool:
    raw_stem = Path(raw_name).stem
    timestamp = TIMESTAMP_PREFIX_RE.match(raw_stem)
    prefix = timestamp.group(1) if timestamp else raw_stem
    if _legacy_ledger_match(raw_source, ledger):
        return True
    if any(stem == raw_stem or stem.startswith(prefix) for stem in drained):
        return True
    if any(saved.glob(f"{prefix}*.analysis.md")):
        return True
    for capture in _capture_sources(resolved, saved):
        if (capture.stem == raw_stem or capture.stem.startswith(prefix)) and _processed(
            capture, saved, ledger, drained
        ):
            return True
    return False


def gate_snapshot(document: object, root: Path | None = None) -> dict[str, object]:
    """Prove the start batch, without allowing later arrivals to move the gate."""
    if not isinstance(document, dict) or document.get("version") != 1:
        raise ValueError("capture snapshot must be an object with version 1")
    pending_items = document.get("pending")
    raw_items = document.get("raw")
    if not isinstance(pending_items, list) or not isinstance(raw_items, list):
        raise ValueError("capture snapshot must contain pending and raw lists")

    alexandria = root or _alexandria_home()
    resolved = alexandria / "files/vault/_input"
    saved = alexandria / "files/vault/saved"
    ledger_path = saved / "ledger.md"
    ledger = ledger_path.read_text(encoding="utf-8", errors="replace") if ledger_path.exists() else ""
    drained = _drained_stems(saved / ".drained")
    unresolved_pending = []
    unresolved_raw = []

    for item in pending_items:
        stem, basename, expected_hash = _snapshot_item(item, kind="pending")
        preserved = saved / basename
        if not preserved.exists() or _sha256(preserved) != expected_hash:
            unresolved_pending.append({"stem": stem, "reason": "exact source not preserved in saved"})
            continue
        if not _processed(preserved, saved, ledger, drained):
            unresolved_pending.append({"stem": stem, "reason": "no analysis or exact verdict proof"})

    for item in raw_items:
        name, basename, expected_hash = _snapshot_item(item, kind="raw")
        original = alexandria / "files/vault/input" / basename
        preserved = saved / basename
        if original.exists():
            unresolved_raw.append({"name": name, "reason": "raw source still in input"})
            continue
        if not preserved.exists() or _sha256(preserved) != expected_hash:
            unresolved_raw.append({"name": name, "reason": "exact raw source not preserved in saved"})
            continue
        if not _raw_processing_proof(preserved, name, resolved, saved, ledger, drained):
            unresolved_raw.append({"name": name, "reason": "no mapped analysis or exact verdict proof"})

    return {
        "complete": not unresolved_pending and not unresolved_raw,
        "pending_total": len(pending_items),
        "raw_total": len(raw_items),
        "unresolved_pending": unresolved_pending,
        "unresolved_raw": unresolved_raw,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="print the complete state as JSON")
    parser.add_argument("--counts", action="store_true", help="print pending and raw counts, tab-separated")
    parser.add_argument("--review", action="store_true", help="print review and processing counts as JSON")
    parser.add_argument("--summary", action="store_true", help="print the shared human-facing count")
    parser.add_argument("--gate", action="store_true", help="exit 2 while extraction work remains")
    parser.add_argument("--snapshot", action="store_true", help="print a hash-pinned start batch as JSON")
    parser.add_argument("--gate-snapshot", metavar="PATH", help="exit 2 until the exact start batch is complete")
    args = parser.parse_args()

    if args.review or args.summary:
        if any((args.json, args.counts, args.gate, args.snapshot, args.gate_snapshot, args.review and args.summary)):
            parser.error("review modes cannot be combined with extraction or other output modes")
        try:
            state = review()
        except OSError as exc:
            print(f"capture count unavailable: {exc}", file=sys.stderr)
            return 2
        print(summary(state) if args.summary else json.dumps(state, indent=2))
        return 0

    if (args.snapshot or args.gate_snapshot) and any(
        (args.json, args.counts, args.gate, args.snapshot and args.gate_snapshot)
    ):
        parser.error("snapshot modes cannot be combined with another output or gate mode")

    if args.snapshot:
        print(json.dumps(snapshot(), indent=2))
        return 0
    if args.gate_snapshot:
        try:
            document = json.loads(Path(args.gate_snapshot).read_text(encoding="utf-8"))
            result = gate_snapshot(document)
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            print(f"capture_state: invalid snapshot: {exc}")
            return 2
        print(json.dumps(result, indent=2))
        return 0 if result["complete"] else 2

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
