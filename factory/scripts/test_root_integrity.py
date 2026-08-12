#!/usr/bin/env python3
"""Tests for constitution root/provenance integrity."""

from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parent))
import root_integrity as ri


CONSTITUTION = """# Mind

### Hold the line
The original position. It should not move silently.

### Ordinary thought
A non-root position that can change with provenance.
"""

ROOT_EMPTY = """# Root set

## accepted

_(none)_
"""

PROVENANCE_HEADER = """# Provenance

Historical entries may use unknown.

---
"""


def run_git(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(root), *args],
        check=True,
        capture_output=True,
        text=True,
    )


def write(root: Path, rel: str, text: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def ordinary_record(**overrides: str) -> str:
    fields = {
        "position": "mind.ordinary-thought",
        "file": "files/constitution/Mind.md",
        "section": "Ordinary thought",
        "kind": "ordinary",
        "before": "A non-root position that can change with provenance.",
        "after": "The updated ordinary position.",
        "reason": "Author confirmed the rewrite.",
        "source": "author",
        "proposer_provider": "xai",
        "proposer_model": "grok-4.6",
        "proposer_harness": "cursor",
        "proposer_session": "sess-ordinary",
        "proposer_influence": "drafted the rewrite; Author chose the words",
        "reviewer_provider": "none",
        "reviewer_model": "none",
        "reviewer_harness": "none",
        "reviewer_session": "none",
        "reviewer_status": "not-required",
        "author_signoff": "yes, write that",
        "timestamp": "2026-08-12T19:00:00Z",
        "git_commit": "pending",
    }
    fields.update(overrides)
    lines = ["---"]
    for key, value in fields.items():
        if "\n" in value:
            lines.append(f"{key}: |")
            for part in value.split("\n"):
                lines.append(f"  {part}")
        else:
            lines.append(f"{key}: {value}")
    lines.append("")
    return "\n".join(lines)


def root_packet(**overrides: str) -> str:
    fields = {
        "position": "mind.hold-the-line",
        "file": "files/constitution/Mind.md",
        "section": "Hold the line",
        "kind": "root-add",
        "status": "case-ready",
        "before": "non-root",
        "after": "root",
        "reason": "Repeatedly relied upon; silent replacement would matter.",
        "source": "engine nomination + author request",
        "proposer_provider": "xai",
        "proposer_model": "grok-4.6",
        "proposer_harness": "cursor",
        "proposer_session": "sess-propose",
        "proposer_influence": "wrote the packet; did not choose the belief",
        "reviewer_provider": "anthropic",
        "reviewer_model": "claude-fable-5-thinking-high",
        "reviewer_harness": "cursor",
        "reviewer_session": "sess-review",
        "reviewer_status": "review-complete",
        "author_signoff": "I am marking Hold the line as root because I do not want it silently replaced.",
        "timestamp": "2026-08-12T19:10:00Z",
        "git_commit": "pending",
        "case_for": "The position is upstream of many choices; losing it quietly would rewrite the person.",
        "case_against": "Freezing it now hard-codes one influenced collage and calls it sacred.",
    }
    fields.update(overrides)
    lines = ["# root packet", ""]
    for key, value in fields.items():
        if "\n" in value:
            lines.append(f"{key}: |")
            for part in value.split("\n"):
                lines.append(f"  {part}")
        else:
            lines.append(f"{key}: {value}")
    lines.append("")
    lines.append("## case for")
    lines.append("")
    lines.append(fields["case_for"])
    lines.append("")
    lines.append("## case against")
    lines.append("")
    lines.append(fields["case_against"])
    lines.append("")
    return "\n".join(lines)


def accepted_root() -> str:
    return """# Root set

## accepted

### mind.hold-the-line
- file: files/constitution/Mind.md
- section: Hold the line
- since: 2026-08-12
- packet: files/works/root-packets/mind.hold-the-line.md
"""


class Repo:
    def __init__(self) -> None:
        self._tmp = TemporaryDirectory()
        self.root = Path(self._tmp.name)
        run_git(self.root, "init")
        run_git(self.root, "config", "user.email", "test@example.com")
        run_git(self.root, "config", "user.name", "Test")
        run_git(self.root, "config", "commit.gpgsign", "false")
        write(self.root, "files/constitution/Mind.md", CONSTITUTION)
        write(self.root, "files/works/root.md", ROOT_EMPTY)
        write(self.root, "files/works/provenance.md", PROVENANCE_HEADER)
        write(self.root, "files/works/root-packets/README.md", "packets\n")
        run_git(self.root, "add", "-A")
        run_git(self.root, "commit", "-m", "seed")

    def stage(self, rel: str, text: str) -> None:
        write(self.root, rel, text)
        run_git(self.root, "add", rel)

    def commit_all(self, message: str) -> None:
        run_git(self.root, "add", "-A")
        run_git(self.root, "commit", "-m", message)

    def check(self) -> ri.CheckResult:
        return ri.check_repo(self.root, staged=True)

    def codes(self) -> set[str]:
        return {f.code for f in self.check().findings}


class ParseAndFamilyTests(unittest.TestCase):
    def test_unknown_reviewer_is_not_independent(self) -> None:
        ok, why = ri.independent_review("xai", "grok-4.6", "unknown", "unknown")
        self.assertFalse(ok)
        self.assertIn("unknown", why)

    def test_same_provider_is_not_independent(self) -> None:
        ok, why = ri.independent_review("anthropic", "claude-opus-4", "anthropic", "claude-sonnet-4")
        self.assertFalse(ok)
        self.assertIn("same", why)

    def test_same_family_alias_is_not_independent(self) -> None:
        ok, _ = ri.independent_review("openai", "gpt-4.1", "chatgpt", "o3")
        self.assertFalse(ok)

    def test_named_unlisted_providers_are_independent(self) -> None:
        ok, why = ri.independent_review("acme", "acme-1", "anthropic", "claude-opus-4")
        self.assertTrue(ok, why)
        ok, why = ri.independent_review("acme", "acme-1", "otherco", "other-1")
        self.assertTrue(ok, why)
        ok, _ = ri.independent_review("acme", "acme-1", "acme", "acme-2")
        self.assertFalse(ok)

    def test_same_app_different_families_count(self) -> None:
        ok, why = ri.independent_review(
            "cursor", "grok-4.6", "cursor", "claude-fable-5-thinking-high"
        )
        self.assertTrue(ok, why)
        ok, why = ri.independent_review("cursor", "grok-4.6", "cursor", "fable")
        self.assertTrue(ok, why)
        ok, _ = ri.independent_review("cursor", "grok-4.6", "cursor", "grok-4")
        self.assertFalse(ok)

    def test_different_families_are_independent(self) -> None:
        ok, why = ri.independent_review("xai", "grok-4.6", "anthropic", "claude-opus-4")
        self.assertTrue(ok, why)

    def test_provenance_template_fence_is_not_a_record(self) -> None:
        text = """# Provenance

Required keys: position, file, section, kind.

```
position: file.section-slug
kind: ordinary
```

---
"""
        records = ri.parse_records(text, "files/works/provenance.md")
        self.assertEqual(records, [])

    def test_historical_unknown_fields_round_trip(self) -> None:
        text = ordinary_record(
            proposer_provider="unknown",
            proposer_model="unknown",
            proposer_harness="unknown",
            proposer_session="unknown",
            proposer_influence="unknown",
            git_commit="unknown",
            kind="historical",
        )
        records = ri.parse_records(text, "files/works/provenance.md")
        self.assertEqual(len(records), 1)
        rec = records[0]
        self.assertEqual(rec.get("proposer_provider"), "unknown")
        self.assertEqual(rec.get("proposer_model"), "unknown")
        self.assertEqual(rec.get("proposer_session"), "unknown")
        self.assertEqual(rec.get("git_commit"), "unknown")
        self.assertEqual(ri.ordinary_record_ok(rec), [])

    def test_model_provider_session_tags_survive_round_trip(self) -> None:
        text = ordinary_record()
        records = ri.parse_records(text, "files/works/provenance.md")
        rec = records[0]
        self.assertEqual(rec.get("proposer_provider"), "xai")
        self.assertEqual(rec.get("proposer_model"), "grok-4.6")
        self.assertEqual(rec.get("proposer_harness"), "cursor")
        self.assertEqual(rec.get("proposer_session"), "sess-ordinary")
        self.assertEqual(rec.get("proposer_influence"), "drafted the rewrite; Author chose the words")
        dumped = ordinary_record(
            proposer_provider=rec.get("proposer_provider"),
            proposer_model=rec.get("proposer_model"),
            proposer_harness=rec.get("proposer_harness"),
            proposer_session=rec.get("proposer_session"),
        )
        again = ri.parse_records(dumped, "files/works/provenance.md")[0]
        self.assertEqual(again.get("proposer_provider"), "xai")
        self.assertEqual(again.get("proposer_model"), "grok-4.6")
        self.assertEqual(again.get("proposer_session"), "sess-ordinary")


class IntegrityTests(unittest.TestCase):
    def test_valid_ordinary_delta_with_provenance(self) -> None:
        repo = Repo()
        updated = CONSTITUTION.replace(
            "A non-root position that can change with provenance.",
            "The updated ordinary position.",
        )
        repo.stage("files/constitution/Mind.md", updated)
        repo.stage("files/works/provenance.md", PROVENANCE_HEADER + ordinary_record())
        self.assertEqual(repo.codes(), set(), repo.check().findings)

    def test_missing_provenance(self) -> None:
        repo = Repo()
        updated = CONSTITUTION.replace(
            "A non-root position that can change with provenance.",
            "The updated ordinary position.",
        )
        repo.stage("files/constitution/Mind.md", updated)
        self.assertIn("missing-provenance", repo.codes())

    def test_adding_a_root_without_a_packet(self) -> None:
        repo = Repo()
        repo.stage("files/works/root.md", accepted_root())
        self.assertIn("root-packet-missing", repo.codes())

    def test_root_change_with_same_provider_reviewer(self) -> None:
        repo = Repo()
        repo.stage(
            "files/works/root-packets/mind.hold-the-line.md",
            root_packet(
                reviewer_provider="xai",
                reviewer_model="grok-4",
                reviewer_harness="cursor",
            ),
        )
        repo.stage("files/works/root.md", accepted_root())
        codes = repo.codes()
        self.assertIn("root-gate-incomplete", codes)
        messages = " ".join(f.message for f in repo.check().findings)
        self.assertIn("family", messages)

    def test_root_change_with_unknown_reviewer(self) -> None:
        repo = Repo()
        repo.stage(
            "files/works/root-packets/mind.hold-the-line.md",
            root_packet(
                reviewer_provider="unknown",
                reviewer_model="unknown",
                reviewer_harness="unknown",
                reviewer_session="unknown",
            ),
        )
        repo.stage("files/works/root.md", accepted_root())
        self.assertIn("root-gate-incomplete", repo.codes())
        messages = " ".join(f.message for f in repo.check().findings)
        self.assertIn("unknown", messages)

    def test_root_change_without_author_signoff(self) -> None:
        repo = Repo()
        repo.stage(
            "files/works/root-packets/mind.hold-the-line.md",
            root_packet(author_signoff="none"),
        )
        repo.stage("files/works/root.md", accepted_root())
        self.assertIn("root-gate-incomplete", repo.codes())
        messages = " ".join(f.message for f in repo.check().findings)
        self.assertIn("author_signoff", messages)
        repo.stage(
            "files/works/root-packets/mind.hold-the-line.md",
            root_packet(author_signoff="not-required"),
        )
        self.assertIn("root-gate-incomplete", repo.codes())

    def test_valid_root_transition(self) -> None:
        repo = Repo()
        repo.stage(
            "files/works/root-packets/mind.hold-the-line.md",
            root_packet(),
        )
        repo.stage("files/works/root.md", accepted_root())
        self.assertEqual(repo.codes(), set(), repo.check().findings)

    def test_deletion_overwrite_of_a_root_position(self) -> None:
        repo = Repo()
        repo.stage(
            "files/works/root-packets/mind.hold-the-line.md",
            root_packet(),
        )
        repo.stage("files/works/root.md", accepted_root())
        repo.commit_all("land root")

        overwritten = CONSTITUTION.replace(
            "The original position. It should not move silently.",
            "Silently replaced by the proposing model.",
        )
        repo.stage("files/constitution/Mind.md", overwritten)
        repo.stage(
            "files/works/provenance.md",
            PROVENANCE_HEADER
            + ordinary_record(
                position="mind.hold-the-line",
                section="Hold the line",
                before="The original position. It should not move silently.",
                after="Silently replaced by the proposing model.",
            ),
        )
        codes = repo.codes()
        self.assertTrue(
            {"root-packet-missing", "root-gate-incomplete"} & codes,
            codes,
        )

        deleted = CONSTITUTION.replace("### Hold the line\nThe original position. It should not move silently.\n\n", "")
        repo.stage("files/constitution/Mind.md", deleted)
        self.assertTrue(
            {"root-packet-missing", "root-gate-incomplete"} & repo.codes(),
            repo.codes(),
        )

    def test_historical_unknown_does_not_fail_ordinary(self) -> None:
        repo = Repo()
        updated = CONSTITUTION.replace(
            "A non-root position that can change with provenance.",
            "The updated ordinary position.",
        )
        repo.stage("files/constitution/Mind.md", updated)
        repo.stage(
            "files/works/provenance.md",
            PROVENANCE_HEADER
            + ordinary_record(
                kind="historical",
                proposer_provider="unknown",
                proposer_model="unknown",
                proposer_harness="unknown",
                proposer_session="unknown",
                proposer_influence="unknown",
                git_commit="unknown",
                reviewer_provider="unknown",
                reviewer_model="unknown",
                reviewer_harness="unknown",
                reviewer_session="unknown",
                reviewer_status="unknown",
                author_signoff="unknown",
            ),
        )
        self.assertEqual(repo.codes(), set(), repo.check().findings)

    def test_failed_root_landing_does_not_restore_files(self) -> None:
        repo = Repo()
        repo.stage("files/works/root.md", accepted_root())
        result = repo.check()
        self.assertFalse(result.ok)
        self.assertFalse(result.restored)
        on_disk = (repo.root / "files/works/root.md").read_text(encoding="utf-8")
        self.assertIn("mind.hold-the-line", on_disk)


if __name__ == "__main__":
    unittest.main()
