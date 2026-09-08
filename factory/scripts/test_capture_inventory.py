#!/usr/bin/env python3
"""User-visible inventory separates review from unfinished processing."""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    'capture_inventory_state', Path(__file__).with_name('capture_state.py')
)
STATE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = STATE
SPEC.loader.exec_module(STATE)


class CaptureInventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write(self, relative, body='capture'):
        path = self.root / 'files/vault' / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding='utf-8')
        return path

    def counts(self, review, processing):
        result = STATE.review(self.root)
        self.assertEqual(result['review_count'], review)
        self.assertEqual(result['processing_count'], processing)

    def test_missing_vault_is_empty(self):
        self.counts(0, 0)

    def test_arbitrary_filenames_do_not_require_timestamp_convention(self):
        self.write('_input/a thought with spaces.md')
        self.write('saved/book-with-no-date.md')
        self.write('input/voice memo.m4a')
        self.counts(0, 3)

    def test_open_ledger_is_review_closed_ledger_is_neither(self):
        self.write('saved/ledger.md',
                   '- [ ] awaiting reaction\n- [-] engine closed\n'
                   '- [x] author engaged\n# [ ] not an item\n')
        self.counts(1, 0)

    def test_analysis_without_disposition_still_needs_processing(self):
        self.write('saved/source.md')
        self.write('saved/source.analysis.md', 'An interpretation is not a verdict.')
        self.counts(0, 1)

    def test_open_disposition_moves_source_to_review(self):
        self.write('_input/source.md', 'https://example.com/article\n')
        self.write('saved/source.analysis.md')
        self.write('saved/ledger.md', '- [ ] source — discuss this\n')
        self.counts(1, 0)

    def test_drained_manifest_is_engine_disposition(self):
        self.write('_input/source.md')
        self.write('saved/.drained', '# closed stems\nsource\n')
        self.counts(0, 0)

    def test_drained_does_not_erase_open_author_review(self):
        self.write('saved/source.md')
        self.write('saved/.drained', 'source\n')
        self.write('saved/ledger.md', '- [ ] source — live question\n')
        self.counts(1, 0)

    def test_same_stem_in_all_three_folders_is_one_save(self):
        self.write('input/source.md')
        self.write('_input/source.md')
        self.write('saved/source.md')
        self.counts(0, 1)

    def test_recovered_from_metadata_merges_raw_and_resolved(self):
        self.write('input/original-name.html', '<html>source</html>')
        self.write('_input/unrelated-derived-name.md',
                   '# resolved\nhttps://example.com/item\n\n'
                   '_Recovered from `original-name.html`._\n')
        self.write('saved/unrelated-derived-name.md',
                   '# resolved\nhttps://example.com/item\n\n'
                   '_Recovered from `original-name.html`._\n')
        self.counts(0, 1)

    def test_disposition_covers_raw_alias_too(self):
        self.write('input/original-name.html', '<html>source</html>')
        self.write('_input/derived.md', '_Recovered from `original-name.html`._\n')
        self.write('saved/.drained', 'derived\n')
        self.counts(0, 0)

    def test_analysis_and_media_are_not_additional_saves(self):
        self.write('_input/source.md')
        self.write('saved/source.analysis.md')
        self.write('_input/source-media-1.jpg')
        self.write('saved/source-media-2.png')
        self.write('saved/source.transcript.txt')
        self.write('input/.DS_Store')
        self.counts(0, 1)

    def test_unrelated_link_in_body_does_not_close_focal_source(self):
        self.write('_input/source.md',
                   'source: https://example.com/current\n\n'
                   'See also https://example.com/already-read\n')
        self.write('saved/ledger.md',
                   '- [-] https://example.com/already-read — closed\n')
        self.counts(0, 1)

    def test_non_x_focal_url_matches_legacy_disposition(self):
        self.write('_input/ordinary-name.md',
                   'source: https://example.org/essay\n\n'
                   'Discusses https://example.org/another-essay\n')
        self.write('saved/ledger.md',
                   '- [-] [Essay](https://example.org/essay) — confirmatory\n')
        self.counts(0, 0)

    def test_similar_stem_does_not_match_a_different_capture(self):
        self.write('_input/note.md')
        self.write('saved/ledger.md', '- [-] notebook — closed\n')
        self.counts(0, 1)

    def test_summary_reports_both_counts_without_conflating_them(self):
        self.assertEqual(STATE.summary({'review_count': 4, 'processing_count': 2}),
                         '4 to review; 2 to process.')
        self.assertEqual(STATE.summary({'review_count': 0, 'processing_count': 0}),
                         '0 to review; 0 to process.')

    def command(self, arguments):
        env = {key: value for key, value in os.environ.items()
               if key not in ('ALEXANDRIA_RUNTIME_DIR', 'RUNTIME_DIR')}
        env.update(HOME=str(self.root / 'home'), ALEXANDRIA_HOME=str(self.root),
                   ALEXANDRIA_SETUP_PROBE='1')
        return subprocess.run(arguments, input='{}', text=True,
                              capture_output=True, env=env, check=False)

    def test_statusline_reads_default_runtime_helper(self):
        self.write('saved/ledger.md', '- [ ] ready — live question\n')
        self.write('saved/pending.md')
        self.write('saved/pending.analysis.md', 'Still lacks a disposition.')
        helper = self.root / 'home/.local/share/alexandria/scripts/capture_state.py'
        helper.parent.mkdir(parents=True)
        shutil.copyfile(Path(__file__).with_name('capture_state.py'), helper)
        result = self.command(['bash', str(Path(__file__).with_name('statusline.sh'))])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout,
                         '→ 1 to review; 1 to process · start /a in a new tab\n')

    def test_statusline_missing_helper_reports_unavailable(self):
        result = self.command(['bash', str(Path(__file__).with_name('statusline.sh'))])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout,
                         '→ capture count unavailable · start /a in a new tab\n')

    def test_review_and_summary_cli_share_inventory(self):
        self.write('saved/ledger.md', '- [ ] ready — live question\n')
        self.write('_input/pending.md')
        script = str(Path(__file__).with_name('capture_state.py'))
        result = self.command([sys.executable, script, '--review'])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout),
                         {'review_count': 1, 'processing_count': 1})
        result = self.command([sys.executable, script, '--summary'])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, '1 to review; 1 to process.\n')

    def test_cli_rejects_mixed_review_and_extraction_modes(self):
        script = str(Path(__file__).with_name('capture_state.py'))
        for arguments in (['--review', '--summary'], ['--summary', '--gate'],
                          ['--review', '--snapshot'], ['--summary', '--counts'],
                          ['--review', '--json'],
                          ['--summary', '--gate-snapshot', 'missing.json']):
            with self.subTest(arguments=arguments):
                result = self.command([sys.executable, script, *arguments])
                self.assertEqual(result.returncode, 2)
                self.assertIn('cannot be combined', result.stderr)
                self.assertEqual(result.stdout, '')


if __name__ == '__main__':
    unittest.main()
