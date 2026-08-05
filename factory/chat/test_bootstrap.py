from pathlib import Path
import re
import unittest


HERE = Path(__file__).parent


class ChatBootstrapTests(unittest.TestCase):
    def test_drive_note_matches_master(self) -> None:
        start = (HERE / "start.md").read_text(encoding="utf-8")
        master = start.split("\n---\n", 1)[1].strip()
        bootstrap = (HERE / "bootstrap.md").read_text(encoding="utf-8")
        match = re.search(
            r"If Drive is the available home, put this compact operating note in `_start`:\n\n---\n\n(.*?)\n\n---\n\nFinish by",
            bootstrap,
            re.DOTALL,
        )
        self.assertIsNotNone(match)
        assert match
        self.assertEqual(match.group(1).strip(), "# _start — alexandria\n\n" + master)

    def test_prompt_is_additive_and_has_free_mode(self) -> None:
        bootstrap = (HERE / "bootstrap.md").read_text(encoding="utf-8")
        self.assertIn("Keep every instruction, memory, project, connector", bootstrap)
        self.assertIn("including a free ChatGPT account with no Drive", bootstrap)
        self.assertIn("Never give me a list of setup chores", bootstrap)
        self.assertNotIn("Always allow", bootstrap)

    def test_local_installer_keeps_memory_and_adds_exact_folder(self) -> None:
        setup = (HERE.parent / "setup.sh").read_text(encoding="utf-8")
        self.assertIn("permissions.additionalDirectories", setup)
        self.assertIn("merge_writable_root", (HERE.parent / "scripts/configure_codex.py").read_text(encoding="utf-8"))
        self.assertIn('skills/alexandria/SKILL.md', setup)
        self.assertNotIn("generate_memories = false", setup)
        self.assertNotIn("use_memories = false", setup)


if __name__ == "__main__":
    unittest.main()
