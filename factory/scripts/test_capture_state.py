#!/usr/bin/env python3
"""Ground-truth capture-state regressions."""

from __future__ import annotations

import importlib.util
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


if __name__ == "__main__":
    unittest.main()
