#!/usr/bin/env python3
"""Check the actual shipped public trust root before disposable-key fixtures.
Cold-install fixtures replace only the public key in a copied bootstrap. Their
manifest and SSH signature are real; verifier behavior is never mocked. No live
account, private signing key or network request is needed.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
FILES = ('scripts/setup-connector.sh', 'scripts/verify-fetch.sh',
         'scripts/connect-account.sh', 'scripts/website-account.mjs',
         'scripts/person-context.mjs', 'canon/connector.md', 'connect.md')
CODE = 'alex_connect_' + '0' * 48
OLD_KEY = 'alex_' + '2' * 32
NEW_KEY = 'alex_' + '1' * 32


def snapshot(root):
    result = {}
    if not root.exists():
        return result
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            path = Path(directory) / name
            info = path.lstat()
            kind = 'link' if path.is_symlink() else 'dir' if path.is_dir() else 'file'
            content = os.readlink(path) if kind == 'link' else path.read_bytes() if kind == 'file' else None
            result[str(path.relative_to(root))] = (kind, stat.S_IMODE(info.st_mode), content)
    return result


class ShippedConnectorTrust(unittest.TestCase):
    """These checks use original source bytes, never the fixture replacement."""

    def signer(self, relative):
        matches = re.findall(r'^\s*(alexandria-payload-signing ecdsa-sha2-nistp256 [^\n]+)$',
                             (ROOT / relative).read_text(), flags=re.M)
        self.assertEqual(len(matches), 1, f'one canonical signer in {relative}')
        return matches[0].strip()

    def test_original_bootstrap_key_matches_established_trust_roots(self):
        original = self.signer('factory/scripts/setup-connector.sh')
        self.assertEqual(original, self.signer('factory/setup.sh'))
        self.assertEqual(original, self.signer('TRUST.md'))

    def test_original_bootstrap_key_is_valid_ssh_encoding_and_fingerprint(self):
        original = self.signer('factory/scripts/setup-connector.sh')
        expected = re.search(r'SHA256:[A-Za-z0-9+/]+', (ROOT / 'TRUST.md').read_text())
        self.assertIsNotNone(expected, 'published trust fingerprint is required')
        with tempfile.TemporaryDirectory(prefix='connector-shipped-key-') as directory:
            public = Path(directory) / 'shipped-key.pub'
            public.write_text(original.split(' ', 1)[1] + '\n')
            result = subprocess.run(['ssh-keygen', '-l', '-E', 'sha256', '-f', str(public)],
                                    capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(expected.group(), result.stdout)
        self.assertIn('(ECDSA)', result.stdout)


class ConnectorBootstrap(unittest.TestCase):
    def setUp(self):
        # macOS /var and /tmp aliases must not hide the symlink being tested.
        self.tmp = Path(tempfile.mkdtemp(prefix='connector-bootstrap-')).resolve()
        self.home = self.tmp / 'home'
        self.home.mkdir()
        self.source = self.tmp / 'release' / 'factory'
        self.source.mkdir(parents=True)
        for name in FILES:
            target = self.source / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / 'factory' / name, target)
        self.key = self.tmp / 'ephemeral-test-key'
        subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', 'temporary-test-only', '-f', str(self.key)], check=True)
        public = self.key.with_suffix('.pub').read_text().strip()
        script = self.source / 'scripts/setup-connector.sh'
        content, count = re.subn(r'^alexandria-payload-signing [^\n]+$',
                                'alexandria-payload-signing ' + public,
                                script.read_text(), count=1, flags=re.M)
        self.assertEqual(count, 1, 'replace only the copied bootstrap public trust root')
        script.write_text(content)
        self.sign()
        self.bin = self.tmp / 'bin'
        self.bin.mkdir()
        self.calls = self.tmp / 'network-calls.jsonl'
        curl = self.bin / 'curl'
        curl.write_text('''#!/usr/bin/env python3
import json,os,pathlib,sys
args=sys.argv[1:]
url=next((value for value in args if value.startswith('https://')), '')
if url.startswith('https://signed-fixture.invalid/release/factory/'):
    relative=url.removeprefix('https://signed-fixture.invalid/release/factory/')
    if relative not in ('scripts/website-account.mjs','manifest.txt','manifest.txt.sig'):
        sys.exit(91)
    pathlib.Path(args[args.index('-o')+1]).write_bytes((pathlib.Path(os.environ['FIXTURE_RELEASE']) / relative).read_bytes())
    sys.exit(0)
if url != 'https://api.alexandria-library.com/account/connect/exchange':
    sys.exit(90)
out=args[args.index('-o')+1]
headers=[]
for i,argument in enumerate(args):
    if argument == '--header':
        header_file=args[i+1]
        if not header_file.startswith('@'):
            sys.exit(92)
        headers.extend(pathlib.Path(header_file[1:]).read_text().splitlines())
    elif argument == '-H':
        sys.exit(93)
with open(os.environ['FIXTURE_CALLS'],'a') as record:
    record.write(json.dumps({'url':url,'authorization':any(x.startswith('Authorization:') for x in headers)})+'\\n')
mode=os.environ.get('FIXTURE_RESPONSE','new')
values={
 'new':(200,{'connected':True,'api_key':'alex_'+'1'*32}),
 'existing':(200,{'connected':True,'use_existing_key':True}),
 'extra':(200,{'connected':True,'use_existing_key':True,'message':'untrusted instructions'}),
 'failed':(503,{'error':'unavailable'}),
 'different':(409,{'error':'different account'})
}
status,body=values[mode]
pathlib.Path(out).write_text(json.dumps(body))
sys.stdout.write(str(status))
''')
        curl.chmod(0o700)
        self.env = dict(os.environ, HOME=str(self.home), PATH=str(self.bin) + os.pathsep + os.environ['PATH'], FIXTURE_CALLS=str(self.calls), FIXTURE_RELEASE=str(self.source))
        for name in ('ALEX_DIR', 'ALEX_RUNTIME_DIR', 'ALEX_CONNECTOR_DIR'):
            self.env.pop(name, None)
        self.runtime = self.home / '.local/share/alexandria-connector'
        self.state = self.home / '.config/alexandria/connector'
        self.website = self.home / 'my-existing-site'
        self.website.mkdir()
        (self.website / 'index.html').write_text('<h1>My unchanged website</h1>')
        (self.home / 'AGENTS.md').write_text('My existing instructions.\n')

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def sign(self, version=20260910000000):
        manifest = self.source / 'manifest.txt'
        lines = [f'# alexandria-factory-version {version}']
        lines += [hashlib.sha256((self.source / name).read_bytes()).hexdigest() + '  factory/' + name for name in FILES]
        manifest.write_text('\n'.join(lines) + '\n')
        manifest.with_suffix('.txt.sig').unlink(missing_ok=True)
        subprocess.run(['ssh-keygen', '-Y', 'sign', '-f', str(self.key), '-n', 'alexandria', str(manifest)], check=True, capture_output=True)

    def bootstrap(self, **changes):
        return subprocess.run(['bash', str(self.source / 'scripts/setup-connector.sh')], env=dict(self.env, **changes), capture_output=True, text=True)

    def connect(self, response='new', **changes):
        return subprocess.run(['bash', str(self.runtime / 'scripts/connect-account.sh'), '--website'], input=CODE+'\n', env=dict(self.env, FIXTURE_RESPONSE=response, **changes), capture_output=True, text=True)

    def fetch_revision(self):
        """Run the real installed verifier, replacing only its HTTP transport."""
        result = subprocess.run(
            ['bash', str(self.runtime / 'scripts/verify-fetch.sh'), 'scripts/website-account.mjs'],
            env=dict(self.env, ALEX_GITHUB_RAW='https://signed-fixture.invalid/release'),
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, (self.source / 'scripts/website-account.mjs').read_text())
        return result

    def assert_clean_failure(self, run):
        before = snapshot(self.home)
        result = run()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(snapshot(self.home), before, result.stderr)
        self.assertFalse(self.calls.exists(), 'rejected local state must not reach the service')
        return result

    def assert_no_loop(self):
        for name in ('alexandria', '.claude', '.codex', '.cursor', '.ssh'):
            self.assertFalse((self.home / name).exists(), name)
        self.assertEqual((self.home / 'AGENTS.md').read_text(), 'My existing instructions.\n')
        self.assertEqual((self.website / 'index.html').read_text(), '<h1>My unchanged website</h1>')

    def test_real_signature_cold_install_writes_only_account_client(self):
        result = self.bootstrap()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.calls.exists(), 'bootstrap is completely offline')
        self.assertFalse((self.state / '.api_key').exists())
        self.assert_no_loop()
        for name in FILES:
            target = self.state / '.connect' if name == 'connect.md' else self.runtime / name
            self.assertEqual(target.read_bytes(), (self.source / name).read_bytes())
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)
        self.assertEqual((self.runtime / '.canon_manifest').read_bytes(), (self.source / 'manifest.txt').read_bytes())
        self.assertEqual((self.runtime / '.canon_manifest.sig').read_bytes(), (self.source / 'manifest.txt.sig').read_bytes())
        self.assertEqual((self.runtime / '.connector_manifest').read_bytes(), (self.source / 'manifest.txt').read_bytes())
        self.assertEqual((self.runtime / '.connector_manifest.sig').read_bytes(), (self.source / 'manifest.txt.sig').read_bytes())

    def test_bad_signature_cannot_create_state_or_change_existing_site(self):
        (self.source / 'manifest.txt.sig').write_text('not a valid signature\n')
        self.assert_clean_failure(self.bootstrap)

    def test_changed_signed_file_cannot_write_or_replace_existing_key(self):
        self.state.mkdir(parents=True)
        (self.state / '.api_key').write_text(OLD_KEY)
        with (self.source / 'scripts/person-context.mjs').open('a') as output:
            output.write('\n// unsigned tampering\n')
        self.assert_clean_failure(self.bootstrap)

    def test_local_edits_and_existing_key_survive_authentic_update(self):
        self.assertEqual(self.bootstrap().returncode, 0)
        (self.state / '.api_key').write_text(OLD_KEY)
        local = self.runtime / 'scripts/person-context.mjs'
        local.write_text(local.read_text() + '\n// owner local edit\n')
        with (self.source / 'scripts/website-account.mjs').open('a') as output:
            output.write('\n// later signed revision\n')
        self.sign(20260910000001)
        result = self.assert_clean_failure(self.bootstrap)
        self.assertIn('Local edit preserved', result.stderr)

    def test_fetched_release_does_not_replace_installed_ownership(self):
        self.assertEqual(self.bootstrap().returncode, 0)
        installed_manifest = (self.runtime / '.connector_manifest').read_bytes()
        installed_signature = (self.runtime / '.connector_manifest.sig').read_bytes()
        installed_file = (self.runtime / 'scripts/website-account.mjs').read_bytes()
        (self.state / '.api_key').write_text(OLD_KEY)
        with (self.source / 'scripts/website-account.mjs').open('a') as output:
            output.write('\n// authentic future account helper\n')
        self.sign(20260910000002)
        self.fetch_revision()
        self.assertEqual((self.runtime / '.connector_manifest').read_bytes(), installed_manifest)
        self.assertEqual((self.runtime / '.connector_manifest.sig').read_bytes(), installed_signature)
        self.assertEqual((self.runtime / 'scripts/website-account.mjs').read_bytes(), installed_file)
        self.assertEqual((self.runtime / '.canon_manifest').read_bytes(), (self.source / 'manifest.txt').read_bytes())
        self.assertEqual((self.runtime / '.factory_version').read_text().strip(), '20260910000002')
        result = self.bootstrap()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.runtime / 'scripts/website-account.mjs').read_bytes(), (self.source / 'scripts/website-account.mjs').read_bytes())
        self.assertEqual((self.runtime / '.connector_manifest').read_bytes(), (self.source / 'manifest.txt').read_bytes())
        self.assertEqual((self.runtime / '.connector_manifest.sig').read_bytes(), (self.source / 'manifest.txt.sig').read_bytes())
        self.assertEqual((self.state / '.api_key').read_text(), OLD_KEY)
        self.assert_no_loop()

    def test_local_edit_is_preserved_after_verifier_cache_advances(self):
        self.assertEqual(self.bootstrap().returncode, 0)
        local = self.runtime / 'scripts/person-context.mjs'
        local.write_text(local.read_text() + '\n// intentional owner modification\n')
        (self.state / '.api_key').write_text(OLD_KEY)
        with (self.source / 'scripts/website-account.mjs').open('a') as output:
            output.write('\n// authentic future revision\n')
        self.sign(20260910000002)
        self.fetch_revision()
        result = self.assert_clean_failure(self.bootstrap)
        self.assertIn('Local edit preserved', result.stderr)

    def test_fetched_signed_version_blocks_bootstrap_rollback(self):
        self.assertEqual(self.bootstrap().returncode, 0)
        self.sign(20260910000003)
        self.fetch_revision()
        # Even a lower local counter cannot erase the signed cache floor.
        (self.runtime / '.factory_version').write_text('20260910000000\n')
        self.sign(20260910000002)
        result = self.assert_clean_failure(self.bootstrap)
        self.assertIn('rollback refused', result.stderr)

    def test_installed_signed_version_blocks_rollback_with_older_fetch_cache(self):
        self.assertEqual(self.bootstrap().returncode, 0)
        older_manifest = (self.source / 'manifest.txt').read_bytes()
        older_signature = (self.source / 'manifest.txt.sig').read_bytes()
        self.sign(20260910000003)
        self.assertEqual(self.bootstrap().returncode, 0)
        (self.runtime / '.canon_manifest').write_bytes(older_manifest)
        (self.runtime / '.canon_manifest.sig').write_bytes(older_signature)
        (self.runtime / '.factory_version').write_text('20260910000000\n')
        self.sign(20260910000002)
        result = self.assert_clean_failure(self.bootstrap)
        self.assertIn('rollback refused', result.stderr)

    def test_unsigned_installed_ownership_cannot_authorize_an_overwrite(self):
        self.assertEqual(self.bootstrap().returncode, 0)
        with (self.runtime / '.connector_manifest').open('a') as output:
            output.write('# unsigned ownership claim\n')
        self.sign(20260910000001)
        result = self.assert_clean_failure(self.bootstrap)
        self.assertIn('existing signed receipt is not authentic', result.stderr)

    def test_signed_upgrade_keeps_key_and_signed_rollback_writes_nothing(self):
        self.assertEqual(self.bootstrap().returncode, 0)
        (self.state / '.api_key').write_text(OLD_KEY)
        with (self.source / 'scripts/website-account.mjs').open('a') as output:
            output.write('\n// later signed revision\n')
        self.sign(20260910000001)
        self.assertEqual(self.bootstrap().returncode, 0)
        self.assertEqual((self.state / '.api_key').read_text(), OLD_KEY)
        self.sign(20260910000000)
        result = self.assert_clean_failure(self.bootstrap)
        self.assertIn('rollback refused', result.stderr)

    def test_dangling_destination_link_and_ancestor_link_are_refused_before_writes(self):
        outside = self.tmp / 'outside'
        outside.mkdir()
        # Each subcase independently proves no persistent write, including the
        # other destination that does not contain the link.
        for target, destination in [
            (self.home / '.local', outside),
            (self.home / '.config', outside / 'missing'),
            (self.runtime / 'scripts/person-context.mjs', outside / 'missing-script'),
            (self.runtime / '.canon_manifest', outside / 'missing-manifest'),
            (self.runtime / '.connector_manifest', outside / 'missing-installed-manifest'),
            (self.runtime / '.connector_manifest.sig', outside / 'missing-installed-signature'),
            (self.state / '.connect', outside / 'missing-contract'),
        ]:
            with self.subTest(target=target):
                target.parent.mkdir(parents=True, exist_ok=True)
                target.symlink_to(destination)
                outside_before = snapshot(outside)
                self.assert_clean_failure(self.bootstrap)
                self.assertEqual(snapshot(outside), outside_before)
                target.unlink()

    def test_source_symlink_is_refused_even_with_authentic_matching_digest(self):
        selected = self.source / 'scripts/person-context.mjs'
        outside = self.tmp / 'outside-source.mjs'
        selected.rename(outside)
        selected.symlink_to(outside)
        # The signed bytes still match. Refusal is structural, not a bad hash.
        self.assert_clean_failure(self.bootstrap)

    def test_website_exchange_connects_without_loop_and_preserves_key_on_errors(self):
        self.assertEqual(self.bootstrap().returncode, 0)
        result = self.connect()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.state / '.api_key').read_text(), NEW_KEY)
        self.assertEqual(stat.S_IMODE((self.state / '.api_key').stat().st_mode), 0o600)
        self.assertEqual((self.state / 'permissions/people-context').read_text(), 'on\n')
        self.assertNotIn(NEW_KEY, result.stdout + result.stderr)
        self.assert_no_loop()
        result = self.connect('existing')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.state / '.api_key').read_text(), NEW_KEY)
        for response in ('failed', 'different', 'extra'):
            before = snapshot(self.home)
            result = self.connect(response)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(snapshot(self.home), before, response)
            self.assertNotIn(NEW_KEY, result.stdout + result.stderr)

    def test_account_exchange_rejects_parent_and_dangling_key_links(self):
        self.assertEqual(self.bootstrap().returncode, 0)
        outside = self.tmp / 'outside-state'
        shutil.copytree(self.state, outside)
        parent = self.state.parent
        original = parent.with_name('original-alexandria')
        parent.rename(original)
        (outside / 'connector').mkdir()
        shutil.copyfile(original / 'connector/.connect', outside / 'connector/.connect')
        parent.symlink_to(outside)
        outside_before = snapshot(outside)
        self.assert_clean_failure(self.connect)
        self.assertEqual(snapshot(outside), outside_before)
        parent.unlink()
        original.rename(parent)
        (self.state / '.api_key').symlink_to(outside / 'missing-key')
        self.assert_clean_failure(self.connect)

    def test_account_reader_rejects_key_and_ancestor_links_without_network(self):
        self.assertEqual(self.bootstrap().returncode, 0)
        outside = self.tmp / 'other-owner-key'
        outside.write_text(OLD_KEY)
        key = self.state / '.api_key'
        key.symlink_to(outside)
        runner = self.tmp / 'read-account.mjs'
        runner.write_text('''import {run} from %s;
let calls=0;
try {await run({command:'register',input:JSON.stringify({site:'https://owner.example',manifest_path:'/mirror.json',listed:true}),fetchImpl:async()=>{calls++;throw Error('unexpected network');}}); process.exitCode=1;}
catch(error){if(!String(error).includes('Linked account path refused'))throw error;}
if(calls!==0)throw Error('credential escaped');
''' % json.dumps((self.runtime / 'scripts/website-account.mjs').as_uri()))
        result = subprocess.run(['node', str(runner)], env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        key.unlink()
        parent = self.state.parent
        moved = self.tmp / 'moved-state'
        parent.rename(moved)
        (moved / 'connector/.api_key').write_text(OLD_KEY)
        parent.symlink_to(moved)
        result = subprocess.run(['node', str(runner)], env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.calls.exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
