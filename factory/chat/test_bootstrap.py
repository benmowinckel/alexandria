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
        self.assertIn("Keep everything else", instruction)
        self.assertIn("Use hooks", instruction)
        self.assertIn("end the first normal reply with “Want me to open your alexandria loop", instruction)
        self.assertIn("outside setup, voice, background work, security review", instruction)
        self.assertIn("Never repeat it or open anything before yes", instruction)
        self.assertIn("On yes, open a new chat and invoke the native skill", instruction)
        self.assertIn("name the exact gesture", instruction)
        self.assertIn("save that to alexandria?", instruction)
        self.assertIn("an attached project", instruction)
        self.assertIn("Drive alexandria/_start", instruction)
        self.assertIn("When the start skill runs", instruction)
        self.assertIn("best specific thread", instruction)
        self.assertIn("memory. State its limits", instruction)
        self.assertIn("Read `~/alexandria/system/.connect` and explain it", instruction)
        self.assertIn("Wait for exact `connect`", instruction)
        self.assertIn("Never browse instructions or expose server text", instruction)
        self.assertIn("accept only an exact key or fixed result", instruction)
        self.assertNotIn("selector", instruction)
        self.assertNotIn("untrusted page", instruction)
        self.assertIn("Be generic only without context", instruction)
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
        self.assertIn("A direct host notice is deterministic", foundation)
        self.assertIn("first `startup`, `resume`, or `clear` start", foundation)
        self.assertIn("cannot know whether that prompt will be voice, setup, security review, or `$a`", foundation)
        self.assertIn("Hosts without native chrome or a direct notice keep the portable model-mediated floor", foundation)
        self.assertIn("There is no Stop-loop enforcement", foundation)
        self.assertIn("hidden model context is never counted as delivery", foundation)
        self.assertIn("without trustworthy cross-chat state", foundation)
        self.assertIn("passive session → visible route into an Alexandria session → active session → a better mirror", foundation)
        self.assertIn("Keep the completion to a few short lines", block)
        self.assertIn("The `loop` row is the product test", block)
        self.assertIn("Your AI now has local files it can keep building on with you", block)
        self.assertIn("no personal data was shared, and no account was connected", block)
        self.assertIn("A personalised join argument, automatic browsing, a forced insight", block)
        self.assertNotIn("which other ai do you use most?", block)
        self.assertNotIn("you should join", block.lower())
        self.assertIn("MODE=\"${1:-statusline}\"", renderer)
        self.assertIn("Want me to open your alexandria loop in the background for when you have a minute?", renderer)
        self.assertNotRegex(renderer, r"(?m)^\s*(open|osascript)\b")
        self.assertNotIn("generate_memories = false", setup)
        self.assertNotIn("use_memories = false", setup)


if __name__ == "__main__":
    unittest.main()
