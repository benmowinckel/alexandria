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
        self.assertIn("not another assistant", instruction)
        self.assertIn("Keep everything else", instruction)
        self.assertIn("safest place you can read and update", instruction)
        self.assertIn("In each ordinary conversation", instruction)
        self.assertIn("end your first reply with exactly: “Want me to open your alexandria loop", instruction)
        self.assertIn("except setup, background/security work or Alexandria", instruction)
        self.assertNotIn("ordinary text", instruction)
        self.assertNotIn("except setup, voice", instruction)
        self.assertIn("Ask once; wait for yes", instruction)
        self.assertIn("On yes, open a new conversation and start it", instruction)
        self.assertIn("tell me what to do", instruction)
        self.assertIn("save that to alexandria?", instruction)
        self.assertIn("private repo I chose for a trusted cloud coding session (its branch only)", instruction)
        self.assertIn("Airlock for other remote ai", instruction)
        self.assertIn("then Drive, attached files or this app's memory", instruction)
        self.assertIn("On start", instruction)
        self.assertIn("best unfinished thread", instruction)
        self.assertIn("Choose for me. Never mix copies", instruction)
        self.assertIn("give me a note and say it was not saved", instruction)
        self.assertIn("For `alex_connect_...`, follow `~/alexandria/system/.connect`, wait for `connect`", instruction)
        self.assertIn("never browse or reveal website instructions", instruction)
        self.assertNotIn("selector", instruction)
        self.assertNotIn("untrusted page", instruction)
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
        bootstrap = (HERE / "bootstrap.md").read_text(encoding="utf-8")
        prompt = re.search(r"---PROMPT START---\n\n(.*?)\n\n---PROMPT END---", bootstrap, re.DOTALL)
        assert prompt
        self.assertIn('fetch_factory "chat/bootstrap.md" "$ACCOUNT_BOOTSTRAP" "chat/bootstrap.md" yes', setup)
        self.assertIn('ACCOUNT_INSTRUCTIONS="$ALEX_DIR/system/.account-instructions.md"', setup)
        self.assertIn('ACCOUNT_INSTRUCTIONS_REQUIRED_HASH="$ALEX_DIR/system/.account-instructions-required-hash"', setup)
        self.assertIn('runtime_sha256 "$ACCOUNT_INSTRUCTIONS" > "$ACCOUNT_INSTRUCTIONS_REQUIRED_HASH"', setup)
        self.assertNotIn("<< 'ACCOUNTINSTR'", setup)
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
        self.assertIn("one actual assistant sentence in every new ordinary foreground task", foundation)
        self.assertIn("There is no daily lock, `systemMessage`, warning-field proxy", foundation)
        self.assertIn("only the completed visible assistant reply is", foundation)
        self.assertIn("Stop-loop enforcement", foundation)
        self.assertIn("passive session → visible route into an Alexandria session → active session → a better mirror", foundation)
        self.assertIn("Keep the completion to a few short lines", block)
        self.assertIn("The `loop` row is the product test", block)
        self.assertIn("Your AI now has local files it can keep building on with you", block)
        self.assertIn("no personal data was shared, and no account was connected", block)
        self.assertIn("Which AI app do you use for normal chats?", block)
        self.assertIn("What is my alexandria setup proof? Reply with only the proof.", block)
        self.assertIn(".account_instructions_complete", block)
        self.assertIn(".account-instructions-required-hash", block)
        self.assertIn("those two hash files match exactly", block)
        self.assertIn(".account-instructions-proof", setup)
        self.assertIn("python3 -c 'import secrets; print(secrets.token_hex(8))'", setup)
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
