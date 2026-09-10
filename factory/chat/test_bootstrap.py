from pathlib import Path
import hashlib
import os
import re
import subprocess
import tempfile
import unittest


HERE = Path(__file__).parent


class ChatBootstrapTests(unittest.TestCase):
    def test_actual_installer_completion_preserves_remaining_setup(self) -> None:
        setup = (HERE.parent / "setup.sh").read_text(encoding="utf-8")
        start = setup.index('if [ "$CORE_OK" != "true" ]; then\n  : # The failure')
        end = setup.index('  # Radical UX rule', start)
        # Run only the real final message branches, never the installer.
        script = setup[start:end] + "fi\n"
        for existing in ("", "existing"):
            for keyless in ("true", "false"):
                env = {**os.environ, "CORE_OK": "true", "KEYLESS": keyless,
                       "STATUS_KEY": "ok", "EXISTING_AUTHOR": existing}
                reply = subprocess.run(["bash", "-c", script], env=env, check=True,
                                       capture_output=True, text=True).stdout
                self.assertNotIn("Nothing else", reply)
                self.assertNotIn("nothing leaves this machine", reply)
                if existing:
                    self.assertIn("do not reinstall or repopulate", reply)
                    self.assertIn("Phases 5 and 6", reply)
                    self.assertIn("missing requested account instructions", reply)
                    self.assertIn("give the requested join link", reply)
                    self.assertIn("Otherwise carry on", reply)
                else:
                    self.assertIn("remaining setup", reply)
                    self.assertIn("follow it end-to-end", reply)
                    if keyless == "true":
                        self.assertIn("your AI provider processes what it reads", reply)
                        self.assertIn("Get their ok before opening their personal files", reply)

    def test_installer_proof_changes_with_instruction_and_preserves_headroom(self) -> None:
        setup = (HERE.parent / "setup.sh").read_text(encoding="utf-8")
        proof_start = setup.index('# Personalize the initial local locator.')
        proof_end = setup.index("# ── 3. Platform configuration", proof_start)
        proof_script = setup[proof_start:proof_end]
        bootstrap = (HERE / "bootstrap.md").read_text(encoding="utf-8")
        prompt = re.search(r"---PROMPT START---\n\n(.*?)\n\n---PROMPT END---", bootstrap, re.DOTALL)
        assert prompt
        body = prompt.group(1).strip() + "\n"
        # Execute only the actual proof-generation block inside an isolated
        # temporary home. No installer, account settings or connection runs.
        with tempfile.TemporaryDirectory(prefix="alexandria-instruction-proof-") as temp:
            proof_root = Path(temp)
            system = proof_root / "alexandria/system"
            system.mkdir(parents=True)
            instruction = system / ".account-instructions.md"
            env = {**os.environ, "ALEX_DIR": str(system.parent), "ACCOUNT_INSTRUCTIONS": str(instruction)}
            shell = 'runtime_sha256() { shasum -a 256 "$1" | cut -d" " -f1; }\n' + proof_script

            def generate(text: str) -> tuple[str, str]:
                instruction.write_text(text, encoding="utf-8")
                subprocess.run(["bash", "-c", shell], env=env, check=True, capture_output=True, text=True)
                installed = instruction.read_text()
                token = hashlib.sha256(installed.encode()).hexdigest()
                self.assertIn(f"Our map: {system.parent}.", installed)
                self.assertLess(len(installed), 1500)
                self.assertEqual((system / ".account-instructions-required-hash").read_text().strip(), hashlib.sha256(installed.encode()).hexdigest())
                self.assertNotIn("setup proof", installed)
                return token, installed

            original = generate(body)
            self.assertEqual(generate(body), original, "unchanged instruction must keep the same loading proof")
            changed = generate(body.replace("useful contributions", "useful lasting contributions"))
            self.assertNotEqual(changed[0], original[0], "a prior instruction must not pass a newer version's proof")

    def test_instruction_is_first_person_additive_and_fits_instruction_budget(self) -> None:
        bootstrap = (HERE / "bootstrap.md").read_text(encoding="utf-8")
        prompt = re.search(r"---PROMPT START---\n\n(.*?)\n\n---PROMPT END---", bootstrap, re.DOTALL)
        self.assertIsNotNone(prompt)
        assert prompt
        instruction = prompt.group(1).strip()
        self.assertLessEqual(len(instruction), 1000)
        self.assertTrue(instruction.startswith("Use our personal Alexandria loop and private map of personal data"))
        self.assertIn("Keep my existing instructions", instruction)
        self.assertIn("Load saved guidance and relevant context within approved access", instruction)
        self.assertIn("automatically preserve my useful contributions and maintain our map", instruction)
        self.assertIn("Keep uncertainty labelled", instruction)
        self.assertIn("Ask only for consequential ambiguity, protected-belief changes, new access, sharing or destructive actions", instruction)
        self.assertIn("Verify saves", instruction)
        self.assertIn("every ordinary conversation, including voice, end only the first reply: “Want me to open your alexandria loop", instruction)
        self.assertIn("Skip setup, security/background work and Alexandria sessions", instruction)
        self.assertIn("On yes, open a new chat with the native skill", instruction)
        self.assertIn("if unable, tell me to open one and use that skill, or “start an Alexandria session” if none", instruction)
        self.assertIn("On start, follow our full available protocol; without hooks, run it explicitly", instruction)
        self.assertIn("“a.” closes", instruction)
        self.assertIn("If map access fails, use its approved inbox if writable; otherwise say unsaved", instruction)
        self.assertIn("Never invent context or saves", instruction)
        self.assertNotIn("save that to alexandria?", instruction)
        self.assertNotIn("before saving lasting changes", instruction)
        self.assertNotIn("Before normal saves", instruction)
        self.assertNotIn("alex_connect_", instruction)
        self.assertNotIn("ordinary text", instruction)
        self.assertNotIn("except setup, voice", instruction)
        self.assertNotIn("type /a", instruction)
        self.assertNotIn("type $a", instruction)
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
        self.assertIn("our personal Alexandria loop is ready. our private map lives at [actual local location]", block)
        self.assertIn("This setup sent no personal content to Alexandria and connected no Alexandria account", block)
        self.assertIn("if their AI app runs online, its provider still processes anything they approve it to read", block)
        self.assertIn("Your AI provider still processes what you let it read", block)
        self.assertNotIn("nothing is sent anywhere", block)
        self.assertNotIn("no personal data was shared", block)
        self.assertNotIn("no cloud storage, account", block)
        self.assertIn("Which AI app do you use for normal chats?", block)
        self.assertIn("What personal-loop preferences have I saved, including my map locations and when you should ask before saving?", block)
        self.assertIn(".account_instructions_complete", block)
        self.assertIn(".account-instructions-required-hash", block)
        self.assertIn("An accurate answer plus saved-field read-back checks instruction loading only", block)
        self.assertIn("Separately test retrieval of the approved record and guidance", block)
        self.assertIn("Never create that marker for an unsupported, failed or deferred check", block)
        self.assertIn("A missing or deferred integration never blocks a working local loop", block)
        self.assertNotIn("If I ask for my alexandria setup proof", setup)
        self.assertNotIn("python3 -c 'import secrets; print(secrets.token_hex(8))'", setup)
        self.assertRegex(setup, r'(?m)^.*runtime_sha256 "\$ACCOUNT_INSTRUCTIONS".*$')
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
