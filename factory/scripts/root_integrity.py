#!/usr/bin/env python3
"""Constitution root set, provenance, and transition-gate checker.

Portable stdlib tool. The Author's files are ground truth; this script only
reports. It never restores, rewrites, or deletes constitution files.

A habit pause, not a lock. Same app + different model family counts.
AIs approve process. The Author approves substance.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

CONSTITUTION_DIR = Path("files/constitution")
ROOT_SET_PATH = Path("files/works/root.md")
PROVENANCE_PATH = Path("files/works/provenance.md")
PACKET_DIR = Path("files/works/root-packets")

DERIVATIVE_PREFIX = "_"
EXCLUDED_CONSTITUTION_NAMES = {"catalog.md"}

PLACEHOLDERS = {
    "",
    "none",
    "n/a",
    "na",
    "pending",
    "unknown",
    "yes",
    "approved",
    "ok",
    "review-complete",
    "not-required",
    "notrequired",
}

ROOT_KINDS = {"root-add", "root-change", "root-delete", "root-unmark"}
ORDINARY_KINDS = {"ordinary", "form"}
ALL_KINDS = ROOT_KINDS | ORDINARY_KINDS | {"historical"}

# Independently trained model families. The app (Cursor, Claude Code, Codex)
# is not a family. Fable then Grok in the same Cursor window counts.
PROVIDER_FAMILIES = {
    "anthropic": "anthropic",
    "claude": "anthropic",
    "fable": "anthropic",
    "openai": "openai",
    "chatgpt": "openai",
    "gpt": "openai",
    "google": "google",
    "gemini": "google",
    "deepmind": "google",
    "xai": "xai",
    "grok": "xai",
    "spacexai": "xai",
    "meta": "meta",
    "llama": "meta",
    "mistral": "mistral",
    "cohere": "cohere",
    "deepseek": "deepseek",
    "moonshot": "moonshot",
    "kimi": "moonshot",
    "alibaba": "alibaba",
    "qwen": "alibaba",
    "zhipu": "zhipu",
    "glm": "zhipu",
    "amazon": "amazon",
    "nova": "amazon",
}

HARNESSES = {
    "cursor",
    "claudecode",
    "codex",
    "vscode",
    "windsurf",
    "factory",
    "terminal",
    "cli",
    "app",
}


@dataclass
class Record:
    raw: str
    fields: dict[str, str]
    source_path: str = ""

    def get(self, key: str, default: str = "") -> str:
        return (self.fields.get(key) or default).strip()

    def norm(self, key: str) -> str:
        return normalize_token(self.get(key))


@dataclass
class RootEntry:
    position: str
    file: str
    section: str
    since: str = ""
    packet: str = ""


@dataclass
class Section:
    heading: str
    body: str
    start: int
    end: int

    @property
    def fingerprint(self) -> str:
        return fingerprint_text(self.body)


@dataclass
class Finding:
    code: str
    message: str
    path: str = ""

    def render(self) -> str:
        loc = f"{self.path}: " if self.path else ""
        return f"{self.code}: {loc}{self.message}"


@dataclass
class CheckResult:
    findings: list[Finding] = field(default_factory=list)
    pending_packets: list[str] = field(default_factory=list)
    root_count: int = 0
    restored: bool = False

    @property
    def ok(self) -> bool:
        return not self.findings


def normalize_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").strip().lower())


def fingerprint_text(text: str) -> str:
    collapsed = re.sub(r"\s+", " ", (text or "").strip())
    return hashlib.sha256(collapsed.encode("utf-8")).hexdigest()[:16]


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (text or "").strip().lower()).strip("-")
    return slug or "unnamed"


def is_placeholder(value: str) -> bool:
    return normalize_token(value) in {normalize_token(p) for p in PLACEHOLDERS}


def known_family(raw: str) -> str | None:
    token = normalize_token(raw)
    if not token or is_placeholder(raw) or token in HARNESSES:
        return None
    for key, family in PROVIDER_FAMILIES.items():
        if token == key or token.startswith(key) or key in token:
            return family
    return None


def family_of(provider: str, model: str = "") -> str | None:
    """Model family. Cursor/Claude Code/Codex are apps, not families."""
    known = known_family(model) or known_family(provider)
    if known:
        return known
    token = normalize_token(provider)
    if token and not is_placeholder(provider) and token not in HARNESSES:
        return token
    token = normalize_token(model)
    if token and not is_placeholder(model) and token not in HARNESSES:
        return token
    return None


def independent_review(proposer_provider: str, proposer_model: str,
                       reviewer_provider: str, reviewer_model: str) -> tuple[bool, str]:
    proposer_family = family_of(proposer_provider, proposer_model)
    reviewer_family = family_of(reviewer_provider, reviewer_model)
    if reviewer_family is None:
        return False, "reviewer identity is unknown or placeholder; that does not count"
    if proposer_family is None:
        return False, "proposer identity is unknown, so independence cannot be proved"
    if proposer_family == reviewer_family:
        return False, (
            f"reviewer family {reviewer_family!r} matches proposer family; "
            "same app, new session, alias, version, or reasoning mode does not count"
        )
    return True, ""


def parse_field_block(text: str) -> dict[str, str]:
    """Parse a readable key: value block. `key: |` starts an indented body."""
    fields: dict[str, str] = {}
    lines = text.replace("\r\n", "\n").split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip() or line.strip().startswith("#"):
            i += 1
            continue
        if line.startswith("### ") or line.startswith("## "):
            i += 1
            continue
        if line.startswith("- "):
            line = line[2:]
        match = re.match(r"^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$", line)
        if not match:
            i += 1
            continue
        key, rest = match.group(1).lower(), match.group(2)
        if rest.strip() == "|":
            body: list[str] = []
            i += 1
            while i < len(lines):
                nxt = lines[i]
                if nxt.startswith(" ") or nxt.startswith("\t") or nxt.strip() == "":
                    body.append(re.sub(r"^ {0,2}", "", nxt) if nxt.startswith("  ") else nxt)
                    i += 1
                    continue
                if re.match(r"^-?\s*[A-Za-z][A-Za-z0-9_]*\s*:", nxt) or nxt.startswith("#"):
                    break
                body.append(nxt)
                i += 1
            fields[key] = "\n".join(body).strip("\n")
            continue
        fields[key] = rest.strip().strip('"').strip("'")
        i += 1
    return fields


def strip_fenced_code(text: str) -> str:
    """Drop markdown fences so field templates are not parsed as records."""
    return re.sub(r"```[\s\S]*?```", "", text)


def split_records(text: str) -> list[str]:
    cleaned = strip_fenced_code(text.replace("\r\n", "\n"))
    chunks = re.split(r"\n---+\n", cleaned)
    out = []
    for chunk in chunks:
        body = chunk.strip()
        if not body:
            continue
        if re.match(r"^#\s+", body) and "position:" not in body.lower() and "file:" not in body.lower():
            continue
        if "position:" in body.lower() or "kind:" in body.lower():
            out.append(body)
    return out


def parse_records(text: str, source_path: str = "") -> list[Record]:
    records = []
    for raw in split_records(text):
        fields = parse_field_block(raw)
        if not fields:
            continue
        records.append(Record(raw=raw, fields=fields, source_path=source_path))
    return records


def parse_root_set(text: str) -> list[RootEntry]:
    entries: list[RootEntry] = []
    if not text.strip():
        return entries
    accepted = text
    match = re.search(r"^##\s+accepted\b.*$", text, re.MULTILINE | re.IGNORECASE)
    if match:
        accepted = text[match.end():]
        nxt = re.search(r"^##\s+", accepted, re.MULTILINE)
        if nxt:
            accepted = accepted[:nxt.start()]
    if re.search(r"^\s*(_\()?none\)?\s*$", accepted.strip(), re.IGNORECASE | re.MULTILINE):
        if not re.search(r"^###\s+", accepted, re.MULTILINE):
            return entries
    for block in re.split(r"^###\s+", accepted, flags=re.MULTILINE):
        block = block.strip()
        if not block:
            continue
        lines = block.split("\n", 1)
        position = lines[0].strip().strip("`")
        if not position or position.lower() in {"none", "(none)", "_(none)_"}:
            continue
        fields = parse_field_block(lines[1] if len(lines) > 1 else "")
        file_path = fields.get("file", "").strip()
        section = fields.get("section", "").strip()
        if not file_path or not section:
            continue
        entries.append(
            RootEntry(
                position=position,
                file=file_path,
                section=section,
                since=fields.get("since", "").strip(),
                packet=fields.get("packet", "").strip(),
            )
        )
    return entries


def extract_sections(text: str) -> list[Section]:
    """Split a constitution file into ### position sections, plus a prelude."""
    text = text.replace("\r\n", "\n")
    headings = list(re.finditer(r"^###\s+(.+?)\s*$", text, re.MULTILINE))
    sections: list[Section] = []
    if not headings:
        if text.strip():
            sections.append(Section(heading="(file)", body=text, start=0, end=len(text)))
        return sections
    if headings[0].start() > 0:
        prelude = text[:headings[0].start()]
        if prelude.strip():
            sections.append(Section(heading="(prelude)", body=prelude, start=0, end=headings[0].start()))
    for i, match in enumerate(headings):
        end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        heading = match.group(1).strip()
        body = text[match.start():end]
        sections.append(Section(heading=heading, body=body, start=match.start(), end=end))
    return sections


def section_by_heading(sections: Iterable[Section], heading: str) -> Section | None:
    want = heading.strip().lower()
    for section in sections:
        if section.heading.strip().lower() == want:
            return section
    return None


def is_constitution_source(path: Path) -> bool:
    try:
        rel = path.as_posix()
    except Exception:
        rel = str(path)
    if not rel.startswith("files/constitution/") and not rel.startswith("files/constitution\\"):
        return False
    name = Path(rel).name
    if name.startswith(DERIVATIVE_PREFIX):
        return False
    if name.lower() in EXCLUDED_CONSTITUTION_NAMES:
        return False
    return name.endswith(".md")


def git(root: Path, *args: str, check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(root), *args],
        check=check,
        capture_output=True,
        text=True,
    )


def git_show(root: Path, spec: str) -> str | None:
    result = git(root, "show", spec)
    if result.returncode != 0:
        return None
    return result.stdout


def staged_or_worktree_paths(root: Path, staged: bool) -> set[str]:
    args = ["diff", "--name-only"]
    if staged:
        args.append("--cached")
    else:
        args.extend(["HEAD"])
    result = git(root, *args)
    names = {line.strip() for line in result.stdout.splitlines() if line.strip()}
    if not staged:
        untracked = git(root, "ls-files", "--others", "--exclude-standard")
        names.update(line.strip() for line in untracked.stdout.splitlines() if line.strip())
    return names


def file_at(root: Path, rel: str, staged: bool) -> str | None:
    if staged:
        result = git(root, "show", f":{rel}")
        if result.returncode == 0:
            return result.stdout
        return None
    path = root / rel
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return None


def file_at_head(root: Path, rel: str) -> str | None:
    return git_show(root, f"HEAD:{rel}")


def load_records_from_text(text: str, source_path: str) -> list[Record]:
    if not text:
        return []
    return parse_records(text, source_path)


def collect_provenance(root: Path, staged: bool) -> list[Record]:
    records: list[Record] = []
    text = file_at(root, PROVENANCE_PATH.as_posix(), staged)
    if text is None and not staged:
        path = root / PROVENANCE_PATH
        if path.is_file():
            text = path.read_text(encoding="utf-8")
    if text:
        records.extend(load_records_from_text(text, PROVENANCE_PATH.as_posix()))
    packet_root = root / PACKET_DIR
    names: list[str] = []
    if staged:
        ls = git(root, "ls-files", "--cached", PACKET_DIR.as_posix())
        names = [line.strip() for line in ls.stdout.splitlines() if line.strip().endswith(".md")]
    elif packet_root.is_dir():
        names = [p.relative_to(root).as_posix() for p in sorted(packet_root.glob("*.md"))]
    for rel in names:
        body = file_at(root, rel, staged)
        if body:
            records.extend(load_records_from_text(body, rel))
    return records


def collect_packets(root: Path, staged: bool) -> list[Record]:
    records = []
    for record in collect_provenance(root, staged):
        kind = record.norm("kind")
        if kind in {normalize_token(k) for k in ROOT_KINDS} or record.source_path.startswith(
            PACKET_DIR.as_posix()
        ):
            records.append(record)
    return records


def changed_constitution_sections(root: Path, rel: str, staged: bool) -> list[tuple[str, str, str]]:
    """Return (heading, before, after) for changed sections in one file."""
    old = file_at_head(root, rel) or ""
    new = file_at(root, rel, staged)
    if new is None:
        new = ""
    old_sections = {s.heading.lower(): s for s in extract_sections(old)}
    new_sections = {s.heading.lower(): s for s in extract_sections(new)}
    changed: list[tuple[str, str, str]] = []
    for key in sorted(set(old_sections) | set(new_sections)):
        before = old_sections[key].body if key in old_sections else ""
        after = new_sections[key].body if key in new_sections else ""
        if fingerprint_text(before) != fingerprint_text(after):
            heading = (new_sections.get(key) or old_sections[key]).heading
            changed.append((heading, before, after))
    return changed


def record_covers(record: Record, rel: str, heading: str) -> bool:
    rec_file = record.get("file").replace("\\", "/")
    want_file = rel.replace("\\", "/")
    if rec_file != want_file and Path(rec_file).name != Path(want_file).name:
        return False
    rec_section = record.get("section").strip().lower()
    if not rec_section or rec_section in {"(file)", "(prelude)", "file"}:
        return True
    return rec_section == heading.strip().lower()


def complete_root_packet(record: Record) -> list[str]:
    missing = []
    for key in (
        "position",
        "file",
        "section",
        "before",
        "after",
        "reason",
        "source",
        "proposer_provider",
        "proposer_model",
        "proposer_harness",
        "proposer_session",
        "proposer_influence",
        "reviewer_provider",
        "reviewer_model",
        "reviewer_harness",
        "reviewer_session",
        "reviewer_status",
        "author_signoff",
        "timestamp",
        "git_commit",
    ):
        if not record.get(key):
            missing.append(key)
    if missing:
        return missing
    if record.norm("reviewer_status") != normalize_token("review-complete"):
        missing.append("reviewer_status=review-complete")
    if is_placeholder(record.get("author_signoff")):
        missing.append("author_signoff (Author's own words, not a placeholder)")
    ok, why = independent_review(
        record.get("proposer_provider"),
        record.get("proposer_model"),
        record.get("reviewer_provider"),
        record.get("reviewer_model"),
    )
    if not ok:
        missing.append(why)
    case_for = record.get("case_for") or record.get("casefor")
    case_against = record.get("case_against") or record.get("caseagainst")
    if not case_for or not case_against:
        # Allow the two sides to live as markdown sections in the raw packet.
        raw = record.raw.lower()
        if "case for" not in raw and "strongest case for" not in raw:
            missing.append("case_for")
        if "case against" not in raw and "strongest case against" not in raw:
            missing.append("case_against")
    return missing


def ordinary_record_ok(record: Record) -> list[str]:
    missing = []
    for key in (
        "position",
        "file",
        "section",
        "before",
        "after",
        "reason",
        "source",
        "proposer_provider",
        "proposer_model",
        "proposer_harness",
        "proposer_session",
        "proposer_influence",
        "reviewer_provider",
        "reviewer_model",
        "reviewer_harness",
        "reviewer_session",
        "reviewer_status",
        "author_signoff",
        "timestamp",
        "git_commit",
    ):
        if not record.get(key):
            missing.append(key)
    kind = record.get("kind") or "ordinary"
    if normalize_token(kind) not in {normalize_token(k) for k in ALL_KINDS}:
        missing.append(f"kind ({kind!r} is not recognised)")
    return missing


def matching_root_packet(
    packets: list[Record],
    position: str,
    rel: str,
    heading: str,
    kind: str | None = None,
    before: str | None = None,
    after: str | None = None,
) -> Record | None:
    want_pos = position.strip().lower()
    want_file = rel.replace("\\", "/")
    want_heading = heading.strip().lower()
    for packet in packets:
        if packet.get("position").strip().lower() != want_pos:
            continue
        rec_file = packet.get("file").replace("\\", "/")
        if rec_file not in {want_file, Path(want_file).name} and Path(rec_file).name != Path(want_file).name:
            continue
        if packet.get("section").strip().lower() != want_heading:
            continue
        if kind and packet.norm("kind") != normalize_token(kind):
            continue
        if before is not None and fingerprint_text(packet.get("before")) != fingerprint_text(before):
            continue
        if after is not None and fingerprint_text(packet.get("after")) != fingerprint_text(after):
            continue
        return packet
    return None


def check_repo(root: Path, staged: bool = True) -> CheckResult:
    result = CheckResult()
    root = root.resolve()
    changed = staged_or_worktree_paths(root, staged)

    old_root_text = file_at_head(root, ROOT_SET_PATH.as_posix()) or ""
    new_root_text = file_at(root, ROOT_SET_PATH.as_posix(), staged)
    if new_root_text is None:
        new_root_text = old_root_text
    old_roots = parse_root_set(old_root_text)
    new_roots = parse_root_set(new_root_text)
    result.root_count = len(new_roots)
    old_by_pos = {e.position.lower(): e for e in old_roots}
    new_by_pos = {e.position.lower(): e for e in new_roots}

    provenance = collect_provenance(root, staged)
    packets = collect_packets(root, staged)
    result.pending_packets = [
        p.source_path or p.get("position")
        for p in packets
        if p.norm("reviewer_status") != normalize_token("review-complete")
        or is_placeholder(p.get("author_signoff"))
    ]

    constitution_changed = sorted(p for p in changed if is_constitution_source(Path(p)))
    root_set_changed = ROOT_SET_PATH.as_posix() in changed

    # Ordinary provenance for every substantive constitution source change.
    for rel in constitution_changed:
        sections = changed_constitution_sections(root, rel, staged)
        if not sections:
            continue
        for heading, before, after in sections:
            covered = [
                r for r in provenance
                if record_covers(r, rel, heading)
            ]
            # Dedup by identity
            seen = set()
            uniq: list[Record] = []
            for rec in covered:
                key = (rec.source_path, rec.get("position"), rec.get("section"), rec.get("timestamp"))
                if key in seen:
                    continue
                seen.add(key)
                uniq.append(rec)
            if not uniq:
                result.findings.append(
                    Finding(
                        "missing-provenance",
                        f"constitution change to {rel!r} section {heading!r} has no provenance record. "
                        f"Write one in {PROVENANCE_PATH.as_posix()} (use unknown where history cannot be reconstructed; never invent tags).",
                        rel,
                    )
                )
                continue
            for rec in uniq:
                kind = rec.get("kind") or "ordinary"
                if normalize_token(kind) in {normalize_token(k) for k in ROOT_KINDS}:
                    continue
                missing = ordinary_record_ok(rec)
                if missing:
                    result.findings.append(
                        Finding(
                            "incomplete-provenance",
                            f"provenance for {rel!r} / {heading!r} is missing {', '.join(missing)}",
                            rec.source_path or PROVENANCE_PATH.as_posix(),
                        )
                    )

    # Root-set membership changes.
    added = [e for pos, e in new_by_pos.items() if pos not in old_by_pos]
    removed = [e for pos, e in old_by_pos.items() if pos not in new_by_pos]
    retained = [(old_by_pos[pos], new_by_pos[pos]) for pos in new_by_pos if pos in old_by_pos]

    def require_complete(
        kind: str,
        entry: RootEntry,
        extra: str = "",
        before: str | None = None,
        after: str | None = None,
    ) -> None:
        packet = matching_root_packet(
            packets,
            entry.position,
            entry.file,
            entry.section,
            kind,
            before=before,
            after=after,
        )
        if packet is None:
            result.findings.append(
                Finding(
                    "root-packet-missing",
                    f"{kind} for {entry.position!r} ({entry.file} / {entry.section}) has no packet. "
                    f"Leave the change pending in {PACKET_DIR.as_posix()}/. Do not land it. {extra}",
                    entry.file,
                )
            )
            return
        missing = complete_root_packet(packet)
        if missing:
            result.findings.append(
                Finding(
                    "root-gate-incomplete",
                    f"{kind} for {entry.position!r} is pending — missing {', '.join(missing)}. "
                    "The existing constitution/root state stays operative. The packet stays pending. "
                    "Nothing was restored or deleted.",
                    packet.source_path or PACKET_DIR.as_posix(),
                )
            )

    for entry in added:
        require_complete("root-add", entry)
    for entry in removed:
        require_complete("root-delete", entry)
    for old, new in retained:
        if old.file != new.file or old.section != new.section:
            require_complete("root-change", new, extra="registry retarget")

    # Root passage overwrite / deletion against the operative (HEAD) root set,
    # and against the new set for files that remain listed.
    operative = old_roots if old_roots else []
    # Also check new roots' passages if they were already present.
    watch = {e.position.lower(): e for e in operative}
    for e in new_roots:
        watch.setdefault(e.position.lower(), e)

    for entry in watch.values():
        rel = entry.file.replace("\\", "/")
        if not rel.startswith("files/"):
            rel = str(Path("files/constitution") / Path(rel).name)
        old_text = file_at_head(root, rel)
        new_text = file_at(root, rel, staged)
        deleted_file = old_text is not None and new_text is None and rel in changed
        if deleted_file:
            require_complete("root-delete", entry, extra="constitution file deleted")
            continue
        if old_text is None and new_text is None:
            continue
        old_sec = section_by_heading(extract_sections(old_text or ""), entry.section)
        new_sec = section_by_heading(extract_sections(new_text or old_text or ""), entry.section)
        if old_sec and new_sec is None:
            require_complete("root-delete", entry, extra="root section heading removed")
            continue
        if old_sec and new_sec and old_sec.fingerprint != new_sec.fingerprint:
            require_complete(
                "root-change",
                entry,
                extra="root passage overwritten",
                before=old_sec.body,
                after=new_sec.body,
            )

    if root_set_changed and not added and not removed:
        # Edits to preamble/notes of the registry are allowed without a packet.
        pass

    result.restored = False
    return result


def status_text(root: Path) -> str:
    result = check_repo(root, staged=False)
    lines = [
        "root integrity status",
        f"accepted roots: {result.root_count}",
    ]
    packets = collect_packets(root, staged=False)
    pending = []
    ready = []
    for packet in packets:
        label = packet.get("position") or packet.source_path
        gaps = complete_root_packet(packet)
        if gaps:
            pending.append(label)
        else:
            ready.append(label)
    if pending:
        lines.append("pending packets (not landed):")
        for item in pending:
            lines.append(f"  - {item}")
        lines.append(
            "handoff: switch to a different model family in this same app "
            "(Fable then Grok in Cursor is enough). Same app does not matter. "
            "Leave the packet in files/works/root-packets/ until that review lands."
        )
    else:
        lines.append("pending packets: none")
    if ready:
        lines.append("packets with complete gate (awaiting Author land or already recorded):")
        for item in ready:
            lines.append(f"  - {item}")
    if result.findings:
        lines.append("open bypasses / incomplete landings:")
        for finding in result.findings:
            lines.append(f"  - {finding.render()}")
    else:
        lines.append("working tree: no root-gate or provenance failures against HEAD")
    return "\n".join(lines) + "\n"


def render_failure(result: CheckResult) -> str:
    lines = [
        "root integrity paused the commit — a habit gate, not a lock.",
        "Nothing was restored. Edit the files, or commit with --no-verify if you are overriding on purpose.",
        "Different model family counts even in the same app (Fable then Grok in Cursor).",
        "Unknown reviewer identity does not count. Same family does not count.",
        "",
    ]
    for finding in result.findings:
        lines.append(f"  - {finding.render()}")
    lines.append("")
    lines.append(f"Write ordinary provenance in {PROVENANCE_PATH.as_posix()}.")
    lines.append(f"Write root packets in {PACKET_DIR.as_posix()}/ and keep them pending until the gate is complete.")
    return "\n".join(lines) + "\n"


def default_root() -> Path:
    env = os.environ.get("ALEXANDRIA_ROOT", "").strip()
    if env:
        return Path(env).expanduser()
    here = Path(__file__).resolve()
    # system/scripts/root_integrity.py -> repo root
    return here.parents[2]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check constitution root/provenance integrity")
    parser.add_argument("command", nargs="?", default="check", choices=["check", "status", "pre-commit"])
    parser.add_argument("--root", type=Path, default=None)
    parser.add_argument("--worktree", action="store_true", help="check worktree vs HEAD instead of the index")
    args = parser.parse_args(argv)
    root = (args.root or default_root()).resolve()
    if args.command == "status":
        sys.stdout.write(status_text(root))
        return 0
    staged = not args.worktree
    if args.command == "pre-commit":
        staged = True
    result = check_repo(root, staged=staged)
    if result.ok:
        if args.command != "pre-commit":
            sys.stdout.write("root integrity: ok\n")
        return 0
    sys.stderr.write(render_failure(result))
    return 1


if __name__ == "__main__":
    sys.exit(main())
