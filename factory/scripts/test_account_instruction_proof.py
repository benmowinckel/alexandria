"""Exercise setup.sh's actual account-instruction generation, without installing."""

from hashlib import sha256
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest


SETUP = Path(__file__).resolve().parents[1] / "setup.sh"
SOURCE = SETUP.read_text(encoding="utf-8")
HASH_FUNCTION = SOURCE[
    SOURCE.index("runtime_sha256() {"):SOURCE.index("\nprior_runtime_matches() {")
]
ACCOUNT_SECTION = SOURCE[
    SOURCE.index('ACCOUNT_BOOTSTRAP="$RUNTIME_DIR/.chat-bootstrap.tmp.$$"'):
    SOURCE.index("# ── 3. Platform configuration")
]


class AccountInstructionProofTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.system = self.root / "alexandria" / "system"
        self.runtime = self.root / "runtime"
        self.system.mkdir(parents=True)
        self.runtime.mkdir()
        self.bootstrap = self.root / "bootstrap.md"

    def read(self, name: str) -> str:
        return (self.system / name).read_text(encoding="utf-8").strip()

    def generate(self, base: str = "Use my existing approved record.", *, no_python: bool = False) -> str:
        self.bootstrap.write_text(
            f"# Fixture\n\n---PROMPT START---\n\n{base}\n\n---PROMPT END---\n",
            encoding="utf-8",
        )
        environment = dict(os.environ)
        environment.update(
            ALEX_DIR=str(self.system.parent),
            RUNTIME_DIR=str(self.runtime),
            PROOF_TEST_BOOTSTRAP=str(self.bootstrap),
        )
        # Only public-file fetching is stubbed. The extraction, nonce selection,
        # revision binding and final required hash are the installer itself.
        shell = "fetch_factory() { cp \"$PROOF_TEST_BOOTSTRAP\" \"$2\"; }\n"
        if no_python:
            shell += (
                'command() { if [ "$1" = "-v" ] && [ "$2" = "python3" ]; '
                'then return 1; else builtin command "$@"; fi; }\n'
            )
        subprocess.run(
            ["bash", "-c", shell + HASH_FUNCTION + "\n" + ACCOUNT_SECTION],
            env=environment,
            check=True,
            capture_output=True,
            text=True,
        )
        return self.read(".account-instructions-proof")

    def test_first_install_binds_proof_to_exact_base_and_final_hash(self) -> None:
        base = "Use my existing approved record."
        proof = self.generate(base)
        self.assertRegex(proof, r"^alexandria-[0-9a-f]{16}$")
        self.assertEqual(
            self.read(".account-instructions-proof-base-hash"),
            sha256((base + "\n").encode()).hexdigest(),
        )
        instruction = (self.system / ".account-instructions.md").read_bytes()
        self.assertIn(proof.encode(), instruction)
        self.assertEqual(
            self.read(".account-instructions-required-hash"), sha256(instruction).hexdigest()
        )
        self.assertFalse((self.system / ".account_instructions_complete").exists())

    def test_identical_rerun_preserves_proof_and_completed_revision(self) -> None:
        proof = self.generate()
        required_hash = self.read(".account-instructions-required-hash")
        completed = self.system / ".account_instructions_complete"
        completed.write_text(required_hash + "\n", encoding="utf-8")
        instruction = (self.system / ".account-instructions.md").read_bytes()
        self.assertEqual(self.generate(), proof)
        self.assertEqual((self.system / ".account-instructions.md").read_bytes(), instruction)
        self.assertEqual(self.read(".account-instructions-required-hash"), required_hash)
        self.assertEqual(self.read(".account_instructions_complete"), required_hash)

    def test_changed_base_rejects_old_proof_and_keeps_old_completion_stale(self) -> None:
        old_proof = self.generate()
        old_hash = self.read(".account-instructions-required-hash")
        (self.system / ".account_instructions_complete").write_text(old_hash + "\n", encoding="utf-8")
        new_proof = self.generate("Use my existing approved record. Ask before saving.")
        # Phase 5 accepts only exact equality with this current proof file.
        self.assertNotEqual(old_proof, new_proof)
        self.assertNotIn(old_proof, self.read(".account-instructions.md"))
        self.assertNotEqual(self.read(".account-instructions-required-hash"), old_hash)
        self.assertEqual(self.read(".account_instructions_complete"), old_hash)
        self.assertEqual(self.generate("Use my existing approved record. Ask before saving."), new_proof)

    def test_legacy_unbound_proof_rotates_once(self) -> None:
        legacy_proof = "alexandria-0123456789abcdef"
        (self.system / ".account-instructions-proof").write_text(legacy_proof + "\n", encoding="utf-8")
        current = self.generate()
        self.assertNotEqual(current, legacy_proof)
        self.assertEqual(self.generate(), current)

    def test_missing_or_invalid_revision_binding_cannot_reuse_proof(self) -> None:
        for binding in (None, "not-a-hash", "0" * 64):
            with self.subTest(binding=binding):
                previous = self.generate()
                path = self.system / ".account-instructions-proof-base-hash"
                if binding is None:
                    path.unlink()
                else:
                    path.write_text(binding + "\n", encoding="utf-8")
                self.assertNotEqual(self.generate(), previous)

    def test_invalid_nonce_is_repaired_with_unchanged_base(self) -> None:
        self.generate()
        (self.system / ".account-instructions-proof").write_text("invalid\n", encoding="utf-8")
        repaired = self.generate()
        self.assertRegex(repaired, r"^alexandria-[0-9a-f]{16}$")
        self.assertEqual(self.generate(), repaired)

    def test_no_python_route_still_rotates_and_is_idempotent(self) -> None:
        first = self.generate(no_python=True)
        self.assertRegex(first, r"^alexandria-[0-9a-f]{16}$")
        self.assertEqual(self.generate(no_python=True), first)
        self.assertNotEqual(self.generate("Updated base.", no_python=True), first)


if __name__ == "__main__":
    unittest.main()
