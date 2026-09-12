#!/usr/bin/env python3
"""Ground-truth capture-state regressions."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "factory/scripts/capture_state.py"
SPEC = importlib.util.spec_from_file_location("capture_state", MODULE_PATH)
STATE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = STATE
SPEC.loader.exec_module(STATE)


class CaptureStateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "files/vault/_input").mkdir(parents=True)
        (self.root / "files/vault/saved").mkdir(parents=True)
        (self.root / "files/vault/input").mkdir(parents=True)

    def tearDown(self):
        self.temp.cleanup()

    def capture(self, stem: str, body: str = "") -> None:
        (self.root / f"files/vault/_input/{stem}.md").write_text(body, encoding="utf-8")

    def test_pending_capture_is_counted(self):
        self.capture("new")
        state = STATE.inspect(self.root)
        self.assertEqual(state.pending, ["new"])
        self.assertEqual(state.pending_paths, ["files/vault/_input/new.md"])

    def test_moving_source_to_saved_does_not_bypass_gate(self):
        (self.root / "files/vault/saved/moved.md").write_text("not processed", encoding="utf-8")
        state = STATE.inspect(self.root)
        self.assertEqual(state.pending, ["moved"])
        self.assertEqual(state.pending_paths, ["files/vault/saved/moved.md"])

    def test_derivative_markdown_is_not_a_capture_source(self):
        (self.root / "files/vault/saved/orphan.analysis.md").write_text("analysis", encoding="utf-8")
        (self.root / "files/vault/saved/ledger.md").write_text("ledger", encoding="utf-8")
        self.assertEqual(STATE.inspect(self.root).pending_count, 0)

    def test_analysis_is_completion_proof(self):
        self.capture("rich")
        (self.root / "files/vault/saved/rich.analysis.md").write_text("analysis", encoding="utf-8")
        state = STATE.inspect(self.root)
        self.assertEqual(state.pending_count, 0)
        self.assertEqual(state.processed_by_analysis, 1)

    def test_drained_manifest_is_completion_proof(self):
        self.capture("confirmatory")
        (self.root / "files/vault/saved/.drained").write_text(
            "# ledger-only verdicts\nconfirmatory\n", encoding="utf-8"
        )
        state = STATE.inspect(self.root)
        self.assertEqual(state.pending_count, 0)
        self.assertEqual(state.processed_by_drained, 1)

    def test_exact_legacy_url_is_completion_proof(self):
        url = "https://example.com/item/123"
        self.capture("legacy", f"source: {url}\n")
        (self.root / "files/vault/saved/ledger.md").write_text(
            f"- [-] processed {url} — skip: confirmatory\n", encoding="utf-8"
        )
        state = STATE.inspect(self.root)
        self.assertEqual(state.pending_count, 0)
        self.assertEqual(state.processed_by_legacy_ledger, 1)

    def test_unrelated_ledger_text_does_not_silence_capture(self):
        self.capture("still-open", "https://example.com/open\n")
        (self.root / "files/vault/saved/ledger.md").write_text(
            "- [-] https://example.com/other\n", encoding="utf-8"
        )
        self.assertEqual(STATE.inspect(self.root).pending, ["still-open"])

    def test_raw_files_are_counted_but_hidden_files_are_not(self):
        (self.root / "files/vault/input/voice.m4a").write_bytes(b"voice")
        (self.root / "files/vault/input/.DS_Store").write_bytes(b"hidden")
        state = STATE.inspect(self.root)
        self.assertEqual(state.raw, ["voice.m4a"])

    def test_gate_fails_closed_while_capture_is_pending(self):
        self.capture("blocked")
        env = {**os.environ, "ALEXANDRIA_HOME": str(self.root)}
        result = subprocess.run(
            [sys.executable, str(MODULE_PATH), "--gate"],
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 2)

    def test_gate_opens_from_present_state_proof(self):
        self.capture("complete")
        (self.root / "files/vault/saved/.drained").write_text("complete\n", encoding="utf-8")
        env = {**os.environ, "ALEXANDRIA_HOME": str(self.root)}
        result = subprocess.run(
            [sys.executable, str(MODULE_PATH), "--gate"],
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0)

    def test_snapshot_gate_tracks_the_exact_start_batch_not_later_arrivals(self):
        self.capture("start", "original bytes")
        document = STATE.snapshot(self.root)
        source = self.root / "files/vault/_input/start.md"
        preserved = self.root / "files/vault/saved/start.md"
        source.replace(preserved)
        (self.root / "files/vault/saved/start.analysis.md").write_text(
            "analysis", encoding="utf-8"
        )
        self.capture("arrived-later", "new work")

        result = STATE.gate_snapshot(document, self.root)
        self.assertTrue(result["complete"])
        self.assertEqual(STATE.inspect(self.root).pending, ["arrived-later"])

    def test_snapshot_gate_fails_when_preserved_source_bytes_changed(self):
        self.capture("changed", "original bytes")
        document = STATE.snapshot(self.root)
        source = self.root / "files/vault/_input/changed.md"
        preserved = self.root / "files/vault/saved/changed.md"
        source.replace(preserved)
        preserved.write_text("different bytes", encoding="utf-8")
        (self.root / "files/vault/saved/changed.analysis.md").write_text(
            "analysis", encoding="utf-8"
        )

        result = STATE.gate_snapshot(document, self.root)
        self.assertFalse(result["complete"])
        self.assertEqual(result["unresolved_pending"][0]["stem"], "changed")

    def test_raw_snapshot_requires_exact_preservation_and_mapped_processing(self):
        raw = self.root / "files/vault/input/20260906-090702.html"
        raw.write_bytes(b"raw html")
        document = STATE.snapshot(self.root)
        raw.replace(self.root / "files/vault/saved/20260906-090702.html")
        derivative = self.root / "files/vault/saved/20260906-090702-source.md"
        derivative.write_text("resolved", encoding="utf-8")
        (self.root / "files/vault/saved/20260906-090702-source.analysis.md").write_text(
            "analysis", encoding="utf-8"
        )

        result = STATE.gate_snapshot(document, self.root)
        self.assertTrue(result["complete"])

    def test_gate_snapshot_cli_fails_closed_on_invalid_document(self):
        snapshot_path = self.root / "bad-snapshot.json"
        snapshot_path.write_text(json.dumps({"version": 9}), encoding="utf-8")
        env = {**os.environ, "ALEXANDRIA_HOME": str(self.root)}
        result = subprocess.run(
            [sys.executable, str(MODULE_PATH), "--gate-snapshot", str(snapshot_path)],
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("invalid snapshot", result.stdout)

    def test_timestamped_folders_are_raw_and_chat_is_not(self):
        bundle = self.root / "files/vault/input/20260911-072507"
        bundle.mkdir()
        (bundle / "page.html").write_text("<html></html>", encoding="utf-8")
        (self.root / "files/vault/input/chat").mkdir()
        (self.root / "files/vault/input/chat/note.md").write_text("chat", encoding="utf-8")
        (self.root / "files/vault/input/Photos").mkdir()
        (self.root / "files/vault/input/voice.m4a").write_bytes(b"voice")
        state = STATE.inspect(self.root)
        self.assertEqual(state.raw, ["20260911-072507", "voice.m4a"])

    def test_raw_folder_snapshot_hashes_the_tree_and_gate_requires_mapped_proof(self):
        bundle = self.root / "files/vault/input/20260911-072507"
        bundle.mkdir()
        (bundle / "page.html").write_text("<html>saved</html>", encoding="utf-8")
        document = STATE.snapshot(self.root)
        preserved = self.root / "files/vault/saved/20260911-072507"
        bundle.replace(preserved)
        derivative = self.root / "files/vault/saved/20260911-072507-link.md"
        derivative.write_text("resolved", encoding="utf-8")
        (self.root / "files/vault/saved/20260911-072507-link.analysis.md").write_text(
            "analysis", encoding="utf-8"
        )
        result = STATE.gate_snapshot(document, self.root)
        self.assertTrue(result["complete"])

    def test_legacy_ledger_match_does_not_read_a_directory_as_text(self):
        bundle = self.root / "files/vault/saved/20260911-072507"
        bundle.mkdir()
        (bundle / "page.html").write_text("https://example.com/item\n", encoding="utf-8")
        self.assertFalse(STATE._legacy_ledger_match(bundle, "- [-] https://example.com/other\n"))
        self.assertTrue(STATE._legacy_ledger_match(bundle, "- [-] 20260911-072507 skip\n"))


if __name__ == "__main__":
    unittest.main()
