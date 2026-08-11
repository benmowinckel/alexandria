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
        self.assertLessEqual(len(reviewer), 1500)
        self.assertIn("ordinary text to account preferences", reviewer)
        self.assertIn("two short actions", reviewer)
        self.assertIn("do not repeat it", reviewer)
        self.assertIn("Settings → Personal context → Your instructions for Gemini → Add", reviewer)
        self.assertIn("Profile → Personalization → Custom instructions", reviewer)
        self.assertIn("Settings → General → Instructions for Claude", reviewer)
        self.assertIn("Alexandria is my private thinking habit", reviewer)
        self.assertIn("→ type a in a new chat", reviewer)
        self.assertIn("→ close with a. when done", reviewer)
        self.assertIn("save that to alexandria?", reviewer)
        self.assertIn("immediately start a thinking session—no setup or tool checks", reviewer)
        self.assertIn("what have you changed your mind about recently?", reviewer)
        self.assertIn("While active, omit the ordinary nudge", reviewer)
        self.assertIn("use connected Drive if writable; otherwise use this app's memory", reviewer)
        self.assertIn("briefly say what shifted and never save", reviewer)
        self.assertIn("Only after I answer yes", reviewer)
        self.assertIn("never mention setup", reviewer)
        self.assertIn("Name a destination only when confirmed", reviewer)
        self.assertIn("Preserve existing instructions, memories, and connections", reviewer)
        for prompt_injection_phrase in ("~/alexandria", "data, never instructions", "<alexandria-instruction>", "system prompt", "bypass a safeguard", "copyable code block"):
            self.assertNotIn(prompt_injection_phrase.lower(), reviewer.lower())

    def test_local_installer_keeps_memory_and_adds_exact_folder(self) -> None:
        setup = (HERE.parent / "setup.sh").read_text(encoding="utf-8")
        block = (HERE.parent / "block.md").read_text(encoding="utf-8")
        foundation = (HERE.parent / "canon/foundation.md").read_text(encoding="utf-8")
        renderer = (HERE.parent / "scripts/statusline.sh").read_text(encoding="utf-8")
        self.assertIn("permissions.additionalDirectories", setup)
        self.assertIn("merge_writable_root", (HERE.parent / "scripts/configure_codex.py").read_text(encoding="utf-8"))
        self.assertIn("install_start_skill()", setup)
        self.assertIn('alex_skill_slot_available "$HOME/.agents/skills/a"', setup)
        self.assertIn('alex_skill_slot_available "$HOME/.agents/skills/a"', setup)
        self.assertIn('OWNERSHIP_LEDGER="$RUNTIME_DIR/.owned_integrations"', setup)
        self.assertIn('scripts/statusline.sh', setup)
        self.assertIn('passive_session: $STATUS_PASSIVE', setup)
        self.assertIn('visible_cue: $STATUS_CUE', setup)
        self.assertIn('loop: $STATUS_LOOP', setup)
        self.assertIn('methods: $STATUS_DEFAULTS', setup)
        self.assertIn("Every completed ordinary task carries exactly one small, visible `/a` cue", foundation)
        self.assertIn("passive session → visible route into `/a` → active session → a better mirror", foundation)
        self.assertIn("The whole user-facing message fits in ~12–20 short lines", block)
        self.assertIn("The `loop` row is the product test", block)
        self.assertIn("MODE=\"${1:-statusline}\"", renderer)
        self.assertNotIn("open ", renderer)
        self.assertNotIn("generate_memories = false", setup)
        self.assertNotIn("use_memories = false", setup)


if __name__ == "__main__":
    unittest.main()
