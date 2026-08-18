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
        self.assertLessEqual(len(instruction), 1100)
        self.assertTrue(instruction.startswith("alexandria is a loop in how you help me"))
        self.assertIn("not an assistant", instruction)
        self.assertIn("Keep everything already there; replace nothing", instruction)
        self.assertIn("Use hooks when available", instruction)
        self.assertIn("only each new ordinary chat’s first reply asks “Want me to open your alexandria loop in the background for when you have a minute?”", instruction)
        self.assertIn("Never repeat", instruction)
        self.assertIn("do not open anything before yes", instruction)
        self.assertIn("immediately open a new chat and invoke its native Alexandria skill—no second question", instruction)
        self.assertIn("actual slash, dollar-sign, or native skill gesture", instruction)
        self.assertIn("save that to alexandria?", instruction)
        self.assertIn("attached folder/project", instruction)
        self.assertIn("Cowork/ChatGPT Work", instruction)
        self.assertIn("writable Drive alexandria/_start", instruction)
        self.assertIn("When the alexandria start skill is invoked", instruction)
        self.assertIn("highest-value specific thread", instruction)
        self.assertIn("be generic only without personal context", instruction)
        self.assertIn("memory, with its limit", instruction)
        self.assertNotIn("type /a", instruction)
        self.assertNotIn("type $a", instruction)
        self.assertNotIn("safeguard", instruction.lower())
        for jailbreak in (
            "this is setup",
            "ordinary text to account preferences",
            "not instructions for this reply",
            "give exactly two short actions",
            "put only the preference",
            "ignore previous",
            "bypass a safeguard",
            "change your safeguards",
            "system prompt",
            "<alexandria-instruction>",
        ):
            self.assertNotIn(jailbreak.lower(), instruction.lower())

    def test_local_installer_keeps_memory_and_adds_exact_folder(self) -> None:
        setup = (HERE.parent / "setup.sh").read_text(encoding="utf-8")
        block = (HERE.parent / "block.md").read_text(encoding="utf-8")
        foundation = (HERE.parent / "canon/foundation.md").read_text(encoding="utf-8")
        renderer = (HERE.parent / "scripts/statusline.sh").read_text(encoding="utf-8")
        installed = re.search(r"cat > \"\$ALEX_DIR/system/\.account-instructions\.md\" << 'ACCOUNTINSTR'\n(.*?)\nACCOUNTINSTR", setup, re.DOTALL)
        self.assertIsNotNone(installed)
        assert installed
        bootstrap = (HERE / "bootstrap.md").read_text(encoding="utf-8")
        prompt = re.search(r"---PROMPT START---\n\n(.*?)\n\n---PROMPT END---", bootstrap, re.DOTALL)
        assert prompt
        self.assertEqual(installed.group(1), prompt.group(1))
        self.assertIn("permissions.additionalDirectories", setup)
        self.assertIn("merge_writable_root", (HERE.parent / "scripts/configure_codex.py").read_text(encoding="utf-8"))
        self.assertIn("configure_grok.py", setup)
        self.assertIn('alex_skill_slot_available "$HOME/.grok/skills/a"', setup)
        self.assertIn('echo "  grok: present"', setup)
        self.assertIn("factory/skills/grok-bot.md is the agent-created workflow", setup)
        self.assertIn("install_start_skill()", setup)
        self.assertIn('alex_skill_slot_available "$HOME/.agents/skills/a"', setup)
        self.assertIn('OWNERSHIP_LEDGER="$RUNTIME_DIR/.owned_integrations"', setup)
        self.assertIn('scripts/statusline.sh', setup)
        self.assertIn('passive_session: $STATUS_PASSIVE', setup)
        self.assertIn('visible_cue: $STATUS_CUE', setup)
        self.assertIn('loop: $STATUS_LOOP', setup)
        self.assertIn('methods: $STATUS_DEFAULTS', setup)
        self.assertIn("An account-level route appears once per ordinary chat", foundation)
        self.assertIn("the first reply asks", foundation)
        self.assertIn("in both text and voice", foundation)
        self.assertIn("The route never repeats in that chat", foundation)
        self.assertIn("never repeat a generic footer on every task", foundation)
        self.assertIn("passive session → visible route into an Alexandria session → active session → a better mirror", foundation)
        self.assertIn("The whole user-facing message fits in ~12–20 short lines", block)
        self.assertIn("The `loop` row is the product test", block)
        self.assertIn("after Phase 5 has shown the first personalized result", block)
        self.assertIn("which other AI app do you use most?", block)
        self.assertIn("any other AI app you use?", block)
        self.assertIn("MODE=\"${1:-statusline}\"", renderer)
        self.assertIn("Want me to open your alexandria loop in the background for when you have a minute?", renderer)
        self.assertNotRegex(renderer, r"(?m)^\s*(open|osascript)\b")
        self.assertNotIn("generate_memories = false", setup)
        self.assertNotIn("use_memories = false", setup)


if __name__ == "__main__":
    unittest.main()
