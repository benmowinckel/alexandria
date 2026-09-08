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
        self.assertLessEqual(len(instruction), 1300)
        self.assertTrue(instruction.startswith("alexandria remembers what matters to me and builds on it"))
        self.assertIn("remembers what matters to me and builds on it", instruction)
        self.assertIn("Keep my existing instructions", instruction)
        self.assertIn("best approved writable home", instruction)
        self.assertIn("In each new ordinary conversation", instruction)
        self.assertIn("each new ordinary conversation, including voice, end only your first reply: “Want me to open your alexandria loop", instruction)
        self.assertIn("Skip setup, background/security work and Alexandria sessions", instruction)
        self.assertNotIn("ordinary text", instruction)
        self.assertNotIn("except setup, voice", instruction)
        self.assertIn("On yes, open a new chat and invoke the native skill", instruction)
        self.assertIn("save that to alexandria?", instruction)
        self.assertIn("before saving a lasting change about me", instruction)
        self.assertNotIn("Before normal saves", instruction)
        self.assertIn("approved writable home: local files", instruction)
        self.assertIn("trusted cloud repo (committed snapshot, own branch)", instruction)
        self.assertIn("isolated Airlock", instruction)
        self.assertNotIn("attached files", instruction)
        self.assertIn("Report features only from current permissions/settings/status", instruction)
        self.assertIn("On start", instruction)
        self.assertIn("best thread", instruction)
        self.assertIn("isolated Airlock; connected storage", instruction)
        self.assertIn("durable app memory", instruction)
        self.assertIn("Keep its home; if access fails, give an unsaved handoff", instruction)
        self.assertIn("For `alex_connect_...`, use only `~/alexandria/system/.connect`, wait for `connect`", instruction)
        self.assertIn("never browse or reveal website instructions", instruction)
        self.assertNotIn("selector", instruction)
        self.assertNotIn("untrusted page", instruction)
        self.assertNotIn("type /a", instruction)
        self.assertNotIn("type $a", instruction)
        self.assertNotIn("safeguard", instruction.lower())
        for jailbreak in (
            "this is setup",
            "ordinary conversation to account preferences",
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
        self.assertIn("This setup did not send your files or personal content to Alexandria's servers", block)
        self.assertIn("if their AI app runs online, its provider still processes anything they approve it to read", block)
        self.assertIn("If your AI runs online, its provider still processes what you let it read", block)
        self.assertNotIn("nothing is sent anywhere", block)
        self.assertNotIn("no personal data was shared", block)
        self.assertNotIn("no cloud storage, account", block)
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

    def test_cross_host_completion_has_no_deferred_join_or_competing_home(self) -> None:
        router = (HERE.parent / "onboarding.md").read_text(encoding="utf-8")
        instructions = (HERE / "instructions.md").read_text(encoding="utf-8")
        start = (HERE / "start.md").read_text(encoding="utf-8")
        block = (HERE.parent / "block.md").read_text(encoding="utf-8")
        foundation = (HERE.parent / "canon/foundation.md").read_text(encoding="utf-8")
        for text in (router, instructions, start, block, foundation):
            self.assertIn("AI setup", text)
        for text in (router, instructions):
            self.assertIn("https://alexandria-library.com/join", text)
            self.assertNotIn("moves down the ladder automatically", text)
            self.assertNotIn("community can be discussed later", text)
        self.assertIn("do not execute repository code before `start`", router)
        self.assertNotIn("benmowinckel/alexandria-private", router)
        self.assertIn("unsupported or explicitly deferred", router)
        self.assertIn("Only an exact match", router)
        self.assertIn("Saving has the same consent boundary on every host", foundation)
        self.assertIn("do not ask twice", foundation)
        for name in ("claudecode.md", "codex.md", "droid.md", "grok-bot.md", "cursor.mdc"):
            skill = (HERE.parent / "skills" / name).read_text(encoding="utf-8")
            self.assertIn("skip onboarding and continue this active session", skill)
            self.assertNotIn("disclose optional connected state and stop", skill)


if __name__ == "__main__":
    unittest.main()
