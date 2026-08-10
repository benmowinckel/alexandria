from pathlib import Path
from tempfile import TemporaryDirectory
import importlib.util
import unittest


MODULE_PATH = Path(__file__).with_name("configure_codex.py")
SPEC = importlib.util.spec_from_file_location("configure_codex", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class WritableRootTests(unittest.TestCase):
    def test_agents_marker_requires_exact_protected_receipt(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            codex = root / ".codex"
            runtime = root / ".local" / "share" / "alexandria"
            ambient = root / "ambient.md"
            codex.mkdir()
            runtime.mkdir(parents=True)
            ambient.write_text(
                "<!-- alexandria:start -->\nowned\n<!-- alexandria:end -->\n",
                encoding="utf-8",
            )
            foreign = (
                "keep\n<!-- alexandria:start -->\nforeign\n"
                "<!-- alexandria:end -->\n"
            )
            agents = codex / "AGENTS.md"
            agents.write_text(foreign, encoding="utf-8")

            with self.assertRaises(SystemExit):
                MODULE.merge_agents(codex, ambient, runtime)
            self.assertEqual(agents.read_text(encoding="utf-8"), foreign)
            self.assertFalse((runtime / ".codex_agents_block_sha").exists())

            legacy_manifest = root / "previous-manifest"
            legacy_digest = MODULE.hashlib.sha256(
                foreign[foreign.index(MODULE.MARKER_START):].strip().encode("utf-8")
            ).hexdigest()
            legacy_manifest.write_text(
                f"{legacy_digest}  factory/skills/codex-ambient.md\n",
                encoding="utf-8",
            )
            self.assertEqual(
                MODULE.merge_agents(codex, ambient, runtime, legacy_manifest),
                "merged",
            )

            first = agents.read_text(encoding="utf-8")
            ambient.write_text(
                "<!-- alexandria:start -->\nupdated\n<!-- alexandria:end -->\n",
                encoding="utf-8",
            )
            self.assertEqual(MODULE.merge_agents(codex, ambient, runtime), "merged")
            self.assertNotEqual(agents.read_text(encoding="utf-8"), first)

            agents.write_text(
                agents.read_text(encoding="utf-8").replace("updated", "tampered"),
                encoding="utf-8",
            )
            tampered = agents.read_text(encoding="utf-8")
            with self.assertRaises(SystemExit):
                MODULE.merge_agents(codex, ambient, runtime)
            self.assertEqual(agents.read_text(encoding="utf-8"), tampered)

    def test_finished_config_is_parsed_and_validated(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            codex = root / ".codex"
            alex = root / "alexandria"
            runtime = root / ".local" / "share" / "alexandria"
            ambient = root / "ambient.md"
            codex.mkdir()
            alex.mkdir()
            runtime.mkdir(parents=True)
            ambient.write_text(
                "<!-- alexandria:start -->\nAlexandria\n<!-- alexandria:end -->\n",
                encoding="utf-8",
            )

            MODULE.merge_hooks(codex, alex, runtime)
            MODULE.merge_agents(codex, ambient, runtime)
            MODULE.merge_writable_root(codex, alex)
            MODULE.validate_install(codex, alex, runtime)

            (codex / "hooks.json").write_text("{malformed", encoding="utf-8")
            with self.assertRaises(SystemExit):
                MODULE.validate_install(codex, alex, runtime)

    def test_hooks_execute_only_from_separate_runtime(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            codex = root / ".codex"
            alex = root / "alexandria"
            runtime = root / ".local" / "share" / "alexandria"
            codex.mkdir()
            alex.mkdir()
            runtime.mkdir(parents=True)

            changed, events = MODULE.merge_hooks(codex, alex, runtime)

            self.assertTrue(changed)
            self.assertEqual(events, {"SessionStart", "SessionEnd", "SubagentStart"})
            text = (codex / "hooks.json").read_text(encoding="utf-8")
            self.assertIn(str(runtime / "hooks" / "shim.sh"), text)
            self.assertIn(str(runtime / "scripts" / "capture_resolver.py"), text)
            self.assertNotIn(str(alex / "system" / "hooks" / "shim.sh"), text)

    def test_adds_root_without_changing_existing_config(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            codex = root / ".codex"
            alex = root / "alexandria"
            codex.mkdir()
            alex.mkdir()
            config = codex / "config.toml"
            config.write_text(
                'model = "gpt-test"\n\n[sandbox_workspace_write]\n'
                'network_access = false\n\n[features]\nhooks = true\n',
                encoding="utf-8",
            )

            self.assertEqual(MODULE.merge_writable_root(codex, alex), "merged")
            text = config.read_text(encoding="utf-8")
            self.assertIn(f'writable_roots = ["{alex.resolve()}"]', text)
            self.assertIn('model = "gpt-test"', text)
            self.assertIn("network_access = false", text)
            self.assertIn("[features]\nhooks = true", text)
            self.assertEqual(MODULE.merge_writable_root(codex, alex), "existing")

    def test_preserves_existing_multiline_roots(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            codex = root / ".codex"
            alex = root / "alexandria"
            codex.mkdir()
            alex.mkdir()
            config = codex / "config.toml"
            config.write_text(
                '[sandbox_workspace_write]\nwritable_roots = [\n  "/one",\n  "/two",\n]\n'
                "network_access = false\n",
                encoding="utf-8",
            )

            self.assertEqual(MODULE.merge_writable_root(codex, alex), "merged")
            text = config.read_text(encoding="utf-8")
            self.assertIn('writable_roots = ["/one", "/two",', text)
            self.assertIn(str(alex), text)
            self.assertIn("network_access = false", text)


if __name__ == "__main__":
    unittest.main()
