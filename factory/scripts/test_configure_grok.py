from pathlib import Path
from tempfile import TemporaryDirectory
import importlib.util
import json
import unittest


MODULE_PATH = Path(__file__).with_name("configure_grok.py")
SPEC = importlib.util.spec_from_file_location("configure_grok", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GrokHookTests(unittest.TestCase):
    def test_writes_native_hooks_and_is_idempotent(self) -> None:
        with TemporaryDirectory() as tmp:
            grok = Path(tmp) / ".grok"
            self.assertEqual(MODULE.write_native_hooks(grok), "merged")
            path = grok / "hooks" / "alexandria.json"
            document = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(document, MODULE.REQUIRED_HOOKS)
            start = document["hooks"]["SessionStart"][0]["hooks"][0]
            self.assertEqual(start["type"], "command")
            self.assertEqual(
                start["command"],
                "bash $HOME/.local/share/alexandria/hooks/shim.sh session-start",
            )
            self.assertEqual(start["timeout"], 60)
            self.assertEqual(
                document["hooks"]["SubagentStart"][0]["hooks"][0]["command"],
                "bash $HOME/.local/share/alexandria/hooks/shim.sh subagent",
            )
            self.assertEqual(MODULE.write_native_hooks(grok), "existing")
            self.assertTrue(MODULE.check_native_hooks(grok))

    def test_refuses_foreign_alexandria_hook_file(self) -> None:
        with TemporaryDirectory() as tmp:
            grok = Path(tmp) / ".grok"
            path = grok / "hooks" / "alexandria.json"
            path.parent.mkdir(parents=True)
            path.write_text('{"hooks":{"SessionStart":[{"hooks":[{"command":"foreign"}]}]}}\n')
            foreign = path.read_text(encoding="utf-8")
            with self.assertRaises(SystemExit):
                MODULE.write_native_hooks(grok)
            self.assertEqual(path.read_text(encoding="utf-8"), foreign)

    def test_claude_compat_double_fire_is_detectable_not_toggled(self) -> None:
        claude = {
            "hooks": {
                "SessionStart": [
                    {
                        "hooks": [
                            {
                                "type": "command",
                                "command": "bash $HOME/.local/share/alexandria/hooks/shim.sh session-start",
                                "timeout": 60,
                            }
                        ]
                    }
                ]
            }
        }
        self.assertTrue(MODULE.claude_compat_would_duplicate(claude))
        self.assertFalse(MODULE.claude_compat_would_duplicate({"hooks": {"SessionStart": []}}))
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("does not toggle Claude or Cursor", source)
        self.assertIn("[compat.claude]", source)


if __name__ == "__main__":
    unittest.main()
