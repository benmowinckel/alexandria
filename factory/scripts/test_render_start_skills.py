#!/usr/bin/env python3
"""Regression tests for the shared start-skill renderer."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "factory/scripts/render_start_skills.py"
START_MARKER = "<!-- BEGIN GENERATED: start-execution -->"
END_MARKER = "<!-- END GENERATED: start-execution -->"
SKILLS = ("claudecode.md", "codex.md", "droid.md", "grok-bot.md")


class RenderStartSkillsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "factory/shared").mkdir(parents=True)
        (self.root / "factory/skills").mkdir(parents=True)
        (self.root / "factory/shared/start-execution.md").write_text(
            "canonical line one\ncanonical line two\n",
            encoding="utf-8",
        )
        for name in SKILLS:
            (self.root / "factory/skills" / name).write_text(
                f"front matter for {name}\n\n{START_MARKER}\nstale\n{END_MARKER}\n\ntail\n",
                encoding="utf-8",
            )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_renderer(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(self.root), *arguments],
            check=False,
            capture_output=True,
            text=True,
        )

    def test_write_updates_every_skill_and_preserves_surrounding_content(self) -> None:
        result = self.run_renderer("--write")
        self.assertEqual(result.returncode, 0, result.stderr)
        expected_region = (
            f"{START_MARKER}\ncanonical line one\ncanonical line two\n{END_MARKER}"
        )
        for name in SKILLS:
            content = (self.root / "factory/skills" / name).read_text(encoding="utf-8")
            self.assertIn(f"front matter for {name}", content)
            self.assertIn(expected_region, content)
            self.assertTrue(content.endswith("\ntail\n"))

    def test_check_passes_after_write_and_write_is_deterministic(self) -> None:
        first = self.run_renderer("--write")
        self.assertEqual(first.returncode, 0, first.stderr)
        before = {
            name: (self.root / "factory/skills" / name).read_bytes() for name in SKILLS
        }

        check = self.run_renderer("--check")
        self.assertEqual(check.returncode, 0, check.stderr)
        self.assertIn("up to date", check.stdout)

        second = self.run_renderer("--write")
        self.assertEqual(second.returncode, 0, second.stderr)
        after = {
            name: (self.root / "factory/skills" / name).read_bytes() for name in SKILLS
        }
        self.assertEqual(after, before)

    def test_default_check_fails_with_useful_drift_output(self) -> None:
        written = self.run_renderer("--write")
        self.assertEqual(written.returncode, 0, written.stderr)
        target = self.root / "factory/skills/codex.md"
        target.write_text(
            target.read_text(encoding="utf-8").replace("canonical line two", "drifted line"),
            encoding="utf-8",
        )

        result = self.run_renderer()
        self.assertEqual(result.returncode, 1)
        self.assertIn("factory/skills/codex.md", result.stderr)
        self.assertIn("-drifted line", result.stderr)
        self.assertIn("+canonical line two", result.stderr)
        self.assertIn("--write", result.stderr)


if __name__ == "__main__":
    unittest.main()
