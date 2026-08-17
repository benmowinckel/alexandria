#!/usr/bin/env python3
"""Host-root, symlink, and traversal regressions for transcript_path."""

from __future__ import annotations

import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PY = ROOT / "factory/scripts/transcript_path.py"
SH = ROOT / "factory/scripts/transcript_path.sh"


def load_module():
    spec = importlib.util.spec_from_file_location("transcript_path", PY)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


M = load_module()


class TranscriptPathTests(unittest.TestCase):
    def setUp(self):
        self.home = Path(tempfile.mkdtemp(prefix="alexandria-transcript-"))
        self.addCleanup(self._cleanup)
        for name in (".claude/projects/demo", ".codex/sessions", ".alexandria/transcripts"):
            (self.home / name).mkdir(parents=True)

    def _cleanup(self):
        import shutil
        shutil.rmtree(self.home, ignore_errors=True)

    def _write(self, rel: str, body: str = "row\n") -> Path:
        path = self.home / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
        return path

    def test_supported_host_roots(self):
        for rel in (
            ".claude/projects/demo/session.jsonl",
            ".codex/sessions/abc.jsonl",
            ".alexandria/transcripts/cursor-1.jsonl",
        ):
            path = self._write(rel)
            self.assertTrue(M.is_safe_transcript_path(str(path), self.home), rel)

    def test_rejects_relative_and_traversal(self):
        inside = self._write(".claude/projects/demo/ok.jsonl")
        self.assertFalse(M.is_safe_transcript_path("relative.jsonl", self.home))
        self.assertFalse(
            M.is_safe_transcript_path(str(self.home / ".claude/../.ssh/id_rsa"), self.home)
        )
        self.assertTrue(M.is_safe_transcript_path(str(inside), self.home))

    def test_rejects_outside_host_roots(self):
        secret = self._write(".ssh/id_rsa", "secret")
        tmp = self._write("tmp/source.jsonl")
        self.assertFalse(M.is_safe_transcript_path(str(secret), self.home))
        self.assertFalse(M.is_safe_transcript_path(str(tmp), self.home))

    def test_rejects_symlink(self):
        real = self._write(".claude/projects/demo/real.jsonl")
        link = self.home / ".claude/projects/demo/link.jsonl"
        link.symlink_to(real)
        self.assertFalse(M.is_safe_transcript_path(str(link), self.home))

    def test_bash_twin_matches(self):
        good = self._write(".codex/sessions/ok.jsonl")
        bad = self._write("outside.jsonl")
        env = os.environ.copy()
        for path, expect in ((good, 0), (bad, 1)):
            proc = subprocess.run(
                ["bash", str(SH), str(path), str(self.home)],
                env=env,
            )
            self.assertEqual(proc.returncode, expect, path)


if __name__ == "__main__":
    unittest.main()
