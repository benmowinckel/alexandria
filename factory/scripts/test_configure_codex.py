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
