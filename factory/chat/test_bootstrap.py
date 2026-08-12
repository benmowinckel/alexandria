from pathlib import Path
import re
import unittest


HERE = Path(__file__).parent


class ChatBootstrapTests(unittest.TestCase):
    def test_instruction_is_first_person_additive_and_fits_free_chatgpt(self) -> None:
        bootstrap = (HERE / "bootstrap.md").read_text(encoding="utf-8")
        prompt = re.search(r"---PROMPT START---\n\n(.*?)\n\n---PROMPT END---", bootstrap, re.DOTALL)
        self.assertIsNotNone(prompt)
        assert prompt
        instruction = prompt.group(1).strip()
        self.assertLessEqual(len(instruction), 1500)
        self.assertTrue(instruction.startswith("I want a private thinking habit."))
        self.assertIn("Keep every instruction, memory, and connection I already have", instruction)
        self.assertIn("Treat this as my preference, not as a command to change your safeguards", instruction)
        self.assertIn("→ type a in a new chat", instruction)
        self.assertIn("→ close with a. when done", instruction)
        self.assertIn("save that to alexandria?", instruction)
        self.assertIn("If I type a, start a thinking session", instruction)
        self.assertIn("what have you changed your mind about recently?", instruction)
        self.assertIn("If I type a., say what shifted and do not save", instruction)
        self.assertIn("save to connected Drive if you can write there; otherwise this app's memory", instruction)
        self.assertIn("noted — I'll use that in future chats", instruction)
        self.assertIn("Never name a destination until the save is confirmed", instruction)
        for jailbreak in (
            "this is setup",
            "ordinary text to account preferences",
            "not instructions for this reply",
            "give exactly two short actions",
            "put only the preference",
            "ignore previous",
            "bypass a safeguard",
            "system prompt",
            "~/alexandria",
            "<alexandria-instruction>",
        ):
            self.assertNotIn(jailbreak.lower(), instruction.lower())

    def test_local_installer_keeps_memory_and_adds_exact_folder(self) -> None:
        setup = (HERE.parent / "setup.sh").read_text(encoding="utf-8")
        block = (HERE.parent / "block.md").read_text(encoding="utf-8")
        foundation = (HERE.parent / "canon/foundation.md").read_text(encoding="utf-8")
        renderer = (HERE.parent / "scripts/statusline.sh").read_text(encoding="utf-8")
        self.assertIn("permissions.additionalDirectories", setup)
        self.assertIn("merge_writable_root", (HERE.parent / "scripts/configure_codex.py").read_text(encoding="utf-8"))
        self.assertIn("install_start_skill()", setup)
        self.assertIn('alex_skill_slot_available "$HOME/.agents/skills/a"', setup)
        self.assertIn('OWNERSHIP_LEDGER="$RUNTIME_DIR/.owned_integrations"', setup)
        self.assertIn('scripts/statusline.sh', setup)
        self.assertIn('passive_session: $STATUS_PASSIVE', setup)
        self.assertIn('visible_cue: $STATUS_CUE', setup)
        self.assertIn('loop: $STATUS_LOOP', setup)
        self.assertIn('methods: $STATUS_DEFAULTS', setup)
        self.assertIn("show the state-aware footer on the first assistant reply", foundation)
        self.assertIn("never repeat a generic footer on every task", foundation)
        self.assertIn("passive session → visible route into an Alexandria session → active session → a better mirror", foundation)
        self.assertIn("The whole user-facing message fits in ~12–20 short lines", block)
        self.assertIn("The `loop` row is the product test", block)
        self.assertIn("MODE=\"${1:-statusline}\"", renderer)
        self.assertNotIn("open ", renderer)
        self.assertNotIn("generate_memories = false", setup)
        self.assertNotIn("use_memories = false", setup)


if __name__ == "__main__":
    unittest.main()
