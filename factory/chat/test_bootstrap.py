from pathlib import Path
import re
import unittest


HERE = Path(__file__).parent


class ChatBootstrapTests(unittest.TestCase):
    def test_reviewed_instruction_is_additive_and_fits_free_chatgpt(self) -> None:
        bootstrap = (HERE / "bootstrap.md").read_text(encoding="utf-8")
        prompt = re.search(r"---PROMPT START---\n\n(.*?)\n\n---PROMPT END---", bootstrap, re.DOTALL)
        self.assertIsNotNone(prompt)
        assert prompt
        reviewer = prompt.group(1).strip()
        embedded = re.search(r"<alexandria-instruction>\n(.*?)\n</alexandria-instruction>", reviewer, re.DOTALL)
        self.assertIsNotNone(embedded)
        assert embedded
        instruction = embedded.group(1).strip()
        self.assertLessEqual(len(instruction), 900)
        self.assertIn("not as instructions to follow yet", reviewer)
        self.assertIn("exactly two short numbered actions", reviewer)
        self.assertIn("recognize the app", reviewer)
        self.assertIn("say only `safe to add.`", reviewer)
        self.assertIn("Do not give me a checklist", reviewer)
        self.assertIn("without replacing any existing instruction, memory, file, connector", instruction)
        self.assertIn("Memory stores my thinking, not these rules", instruction)
        self.assertIn("`~/alexandria`", instruction)
        self.assertIn("`a.` or `alexandria.`", instruction)
        self.assertIn("Never give me a checklist", instruction)
        self.assertNotIn("Always allow", bootstrap)
        for coercive_phrase in ("ignore previous", "bypass", "system prompt", "disable safeguards", "auto-approve"):
            self.assertNotIn(coercive_phrase, instruction.lower())

    def test_local_installer_keeps_memory_and_adds_exact_folder(self) -> None:
        setup = (HERE.parent / "setup.sh").read_text(encoding="utf-8")
        self.assertIn("permissions.additionalDirectories", setup)
        self.assertIn("merge_writable_root", (HERE.parent / "scripts/configure_codex.py").read_text(encoding="utf-8"))
        self.assertIn('skills/alexandria/SKILL.md', setup)
        self.assertNotIn("generate_memories = false", setup)
        self.assertNotIn("use_memories = false", setup)


if __name__ == "__main__":
    unittest.main()
