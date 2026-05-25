/**
 * Hash-chain primitive tests for the audit log.
 *
 * The chain is the load-bearing invariant: every entry's `hash` must equal
 * SHA-256(prev_hash || canonical_json(entry minus hash)). Any tampering with
 * a historic entry breaks every downstream hash, which is detectable by
 * recomputing the chain forward and comparing to the published head.
 *
 * Run: tsx server/test/audit.ts
 */

import assert from 'node:assert';
import { _internal } from '../src/audit.js';

let passed = 0;
const test = (name: string, fn: () => Promise<void> | void) => {
  const result = fn();
  const finish = () => { console.log(`  ✓ ${name}`); passed++; };
  if (result instanceof Promise) return result.then(finish);
  finish();
};

async function run() {
  // -------------------------------------------------------------------------
  // canonicalJson — sort keys + no whitespace, so any verifier reproduces
  // -------------------------------------------------------------------------

  await test('canonicalJson sorts keys', () => {
    const a = _internal.canonicalJson({ b: 2, a: 1 });
    const b = _internal.canonicalJson({ a: 1, b: 2 });
    assert.strictEqual(a, b);
    assert.strictEqual(a, '{"a":1,"b":2}');
  });

  await test('canonicalJson has no whitespace', () => {
    const s = _internal.canonicalJson({ z: 'x', a: 1 });
    assert.ok(!/\s/.test(s), `unexpected whitespace in ${s}`);
  });

  // -------------------------------------------------------------------------
  // sha256Hex — known vector
  // -------------------------------------------------------------------------

  await test('sha256Hex empty string', async () => {
    const h = await _internal.sha256Hex('');
    assert.strictEqual(h, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  await test('sha256Hex known input', async () => {
    const h = await _internal.sha256Hex('hello');
    assert.strictEqual(h, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  // -------------------------------------------------------------------------
  // computeEntryHash — depends on prev_hash + entry contents
  // -------------------------------------------------------------------------

  await test('computeEntryHash differs when entry contents differ', async () => {
    const a = await _internal.computeEntryHash({ prev_hash: _internal.GENESIS_HASH, t: '2026-01-01', e: 'evt', x: '1' });
    const b = await _internal.computeEntryHash({ prev_hash: _internal.GENESIS_HASH, t: '2026-01-01', e: 'evt', x: '2' });
    assert.notStrictEqual(a, b);
  });

  await test('computeEntryHash differs when prev_hash differs', async () => {
    const a = await _internal.computeEntryHash({ prev_hash: _internal.GENESIS_HASH, t: '2026-01-01', e: 'evt' });
    const b = await _internal.computeEntryHash({ prev_hash: 'a'.repeat(64), t: '2026-01-01', e: 'evt' });
    assert.notStrictEqual(a, b);
  });

  await test('computeEntryHash is deterministic across key orderings', async () => {
    const a = await _internal.computeEntryHash({ prev_hash: _internal.GENESIS_HASH, e: 'evt', t: '2026-01-01', x: '1' });
    const b = await _internal.computeEntryHash({ x: '1', t: '2026-01-01', e: 'evt', prev_hash: _internal.GENESIS_HASH });
    assert.strictEqual(a, b);
  });

  // -------------------------------------------------------------------------
  // chainEvents — the load-bearing invariant
  // -------------------------------------------------------------------------

  await test('chainEvents links every entry to the previous via prev_hash', async () => {
    const events = [
      { t: '2026-01-01T00:00:00.000Z', e: 'evt', author: 'a', name: 'f1' },
      { t: '2026-01-01T00:00:01.000Z', e: 'evt', author: 'a', name: 'f2' },
      { t: '2026-01-01T00:00:02.000Z', e: 'evt', author: 'b', name: 'f3' },
    ];
    const { entries, newHead, newN } = await _internal.chainEvents(events, _internal.GENESIS_HASH, 0);
    assert.strictEqual(entries.length, 3);
    assert.strictEqual(entries[0].prev_hash, _internal.GENESIS_HASH);
    assert.strictEqual(entries[1].prev_hash, entries[0].hash);
    assert.strictEqual(entries[2].prev_hash, entries[1].hash);
    assert.strictEqual(newHead, entries[2].hash);
    assert.strictEqual(newN, 3);
  });

  await test('chainEvents continues from a non-genesis head', async () => {
    const events = [{ t: '2026-01-01T00:00:00.000Z', e: 'evt', name: 'f1' }];
    const startHash = 'f'.repeat(64);
    const { entries, newHead } = await _internal.chainEvents(events, startHash, 42);
    assert.strictEqual(entries[0].prev_hash, startHash);
    assert.strictEqual(entries[0].n, 43);
    assert.strictEqual(newHead, entries[0].hash);
  });

  await test('chain is verifiable by walking forward and recomputing', async () => {
    // Simulate a verifier: take stored entries, recompute each hash, compare.
    // This is the algorithm any external observer (an Author auditing us)
    // would run against the GitHub repo's JSONL files.
    const events = [
      { t: '2026-01-01T00:00:00.000Z', e: 'evt', author: 'a' },
      { t: '2026-01-01T00:00:01.000Z', e: 'evt', author: 'b' },
      { t: '2026-01-01T00:00:02.000Z', e: 'evt', author: 'c' },
    ];
    const { entries, newHead } = await _internal.chainEvents(events, _internal.GENESIS_HASH, 0);

    let walkPrev = _internal.GENESIS_HASH;
    for (const entry of entries) {
      const { hash, ...rest } = entry;
      assert.strictEqual(rest.prev_hash, walkPrev, `chain broken at n=${entry.n}`);
      const recomputed = await _internal.computeEntryHash(rest);
      assert.strictEqual(recomputed, hash, `hash mismatch at n=${entry.n}`);
      walkPrev = hash;
    }
    assert.strictEqual(walkPrev, newHead);
  });

  await test('tampering with one entry breaks the next entry\'s hash', async () => {
    // The whole point of the chain. Modify one entry and recompute its hash —
    // the next entry's prev_hash no longer matches, so the chain is provably
    // broken from that point forward.
    const events = [
      { t: '2026-01-01T00:00:00.000Z', e: 'evt', author: 'a' },
      { t: '2026-01-01T00:00:01.000Z', e: 'evt', author: 'b' },
    ];
    const { entries } = await _internal.chainEvents(events, _internal.GENESIS_HASH, 0);

    // Tamper: change the author of entry 0
    const tampered = { ...entries[0], author: 'attacker' };
    const { hash, ...rest } = tampered;
    const recomputed = await _internal.computeEntryHash(rest);

    // The recomputed hash differs from what was originally stored
    assert.notStrictEqual(recomputed, entries[0].hash);
    // And the next entry's prev_hash no longer matches the new tampered hash
    assert.notStrictEqual(entries[1].prev_hash, recomputed);
  });

  console.log(`\n  ${passed} tests passed`);
}

run().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
