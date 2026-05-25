/**
 * Live gate matrix — verifies that the GET /library/:author/file/:name route
 * returns the exact status `authorizeFileRead` would return for the same
 * (visibility × accessor × token) cell.
 *
 * Pure-function correctness is covered by file-access.ts. This file proves
 * the LIVE ROUTE agrees with the function — catches route-wiring drift
 * (forgetting to pass inviteValid, wrong cookie extraction, a new endpoint
 * that skips readProtocolFile, etc.).
 *
 * Discovery, not hand-curation: files come from /library/{author}, so new
 * visibilities/files get coverage automatically as the library grows.
 *
 * Usage:   tsx server/test/gate-matrix.ts
 * Env:
 *   TEST_URL              override base (default https://api.alexandria-library.com)
 *   TEST_AUTHOR_ID        github_login of the author whose files to test (default mowinckelb)
 *   OWNER_API_KEY         API key of the author above; falls back to ~/alexandria/system/.api_key
 *   ALEXANDRIA_TEST_KEY   optional second account; enables the stranger cells
 *
 * Exits non-zero if any cell disagrees with the gate function.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { authorizeFileRead } from '../src/file-access.js';

const BASE = process.env.TEST_URL || 'https://api.alexandria-library.com';
const AUTHOR = process.env.TEST_AUTHOR_ID || 'mowinckelb';
const HOME = process.env.HOME || process.env.USERPROFILE || '';

function loadKey(envName: string, fallbackPath?: string): string | null {
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv.trim();
  if (fallbackPath && existsSync(fallbackPath)) {
    return readFileSync(fallbackPath, 'utf8').trim();
  }
  return null;
}

const OWNER_KEY = loadKey('OWNER_API_KEY', join(HOME, 'alexandria', 'system', '.api_key'));
const STRANGER_KEY = loadKey('ALEXANDRIA_TEST_KEY');

interface FileEntry { name: string; visibility: string; }
type Accessor = 'unauth' | 'owner' | 'stranger';
interface Cell { label: string; accessor: Accessor; query: string; inviteValid: boolean; purchaseValid: boolean; }

// Symbolic IDs — authorizeFileRead's decision only turns on owner-vs-not, so
// any two distinct values work as oracle inputs. No need to know the live
// accounts' github_ids.
const OWNER_SYM = '__owner__';
const STRANGER_SYM = '__stranger__';

function expectedStatus(visibility: string, cell: Cell): number {
  const accessorId =
    cell.accessor === 'unauth' ? null :
    cell.accessor === 'owner'  ? OWNER_SYM :
                                 STRANGER_SYM;
  const decision = authorizeFileRead({
    visibility,
    authorGithubId: OWNER_SYM,
    accessorGithubId: accessorId,
    context: { inviteValid: cell.inviteValid, purchaseValid: cell.purchaseValid },
  });
  return decision.allowed ? 200 : decision.status;
}

async function hit(name: string, cell: Cell): Promise<number> {
  const url = `${BASE}/library/${encodeURIComponent(AUTHOR)}/file/${encodeURIComponent(name)}${cell.query}`;
  const headers: Record<string, string> = {};
  if (cell.accessor === 'owner' && OWNER_KEY) headers.Authorization = `Bearer ${OWNER_KEY}`;
  if (cell.accessor === 'stranger' && STRANGER_KEY) headers.Authorization = `Bearer ${STRANGER_KEY}`;
  const res = await fetch(url, { headers });
  return res.status;
}

function cellsFor(file: FileEntry): Cell[] {
  const cells: Cell[] = [
    { label: `${file.visibility}/${file.name} · unauth`,             accessor: 'unauth',   query: '', inviteValid: false, purchaseValid: false },
    { label: `${file.visibility}/${file.name} · owner`,              accessor: 'owner',    query: '', inviteValid: false, purchaseValid: false },
  ];
  if (STRANGER_KEY) {
    cells.push({ label: `${file.visibility}/${file.name} · stranger`, accessor: 'stranger', query: '', inviteValid: false, purchaseValid: false });
  }
  if (file.visibility === 'invite') {
    cells.push({ label: `invite/${file.name} · unauth + bogus invite`,   accessor: 'unauth',   query: '?invite=DEFINITELY-NOT-A-REAL-CODE', inviteValid: false, purchaseValid: false });
    if (STRANGER_KEY) {
      cells.push({ label: `invite/${file.name} · stranger + bogus invite`, accessor: 'stranger', query: '?invite=DEFINITELY-NOT-A-REAL-CODE', inviteValid: false, purchaseValid: false });
    }
  }
  if (file.visibility === 'paid') {
    cells.push({ label: `paid/${file.name} · unauth + bogus session`,   accessor: 'unauth',   query: '?session_id=cs_test_bogus_definitely_not_real', inviteValid: false, purchaseValid: false });
    if (STRANGER_KEY) {
      cells.push({ label: `paid/${file.name} · stranger + bogus session`, accessor: 'stranger', query: '?session_id=cs_test_bogus_definitely_not_real', inviteValid: false, purchaseValid: false });
    }
  }
  return cells;
}

async function main() {
  console.log(`=== Gate matrix vs ${BASE} (author=${AUTHOR}) ===\n`);
  console.log(`  owner key:    ${OWNER_KEY ? 'present' : 'missing — owner cells will be skipped'}`);
  console.log(`  stranger key: ${STRANGER_KEY ? 'present' : 'missing — stranger cells will be skipped'}\n`);

  const listRes = await fetch(`${BASE}/library/${encodeURIComponent(AUTHOR)}`);
  if (!listRes.ok) {
    console.log(`[gate-matrix] FATAL — could not list ${AUTHOR}'s files (HTTP ${listRes.status})`);
    process.exit(1);
  }
  const body = await listRes.json() as { files?: FileEntry[] };
  const files = body.files || [];

  // One file per visibility is enough to verify wiring — duplicates amplify
  // noise without adding signal. Discovery means new visibilities get covered
  // automatically the moment any file with that visibility ships.
  const byVisibility = new Map<string, FileEntry>();
  for (const file of files) {
    if (!byVisibility.has(file.visibility)) byVisibility.set(file.visibility, file);
  }
  if (byVisibility.size === 0) {
    console.log(`[gate-matrix] ${AUTHOR} has no published files — nothing to test`);
    process.exit(0);
  }
  console.log(`Visibilities found: ${[...byVisibility.keys()].join(', ')}\n`);

  let passed = 0, failed = 0;
  const failures: string[] = [];

  for (const file of byVisibility.values()) {
    for (const cell of cellsFor(file)) {
      // Skip owner cells when no owner key — can't ask the server who we are
      // without credentials. Surfaced in the summary above.
      if (cell.accessor === 'owner' && !OWNER_KEY) continue;
      if (cell.accessor === 'stranger' && !STRANGER_KEY) continue;
      const expected = expectedStatus(file.visibility, cell);
      const got = await hit(file.name, cell);
      if (got === expected) {
        console.log(`  ✓ ${cell.label} → ${got}`);
        passed++;
      } else {
        console.log(`  ✗ ${cell.label} → got ${got}, expected ${expected}`);
        failures.push(`${cell.label}: got ${got}, expected ${expected}`);
        failed++;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Positive invite path — verifies the full mint → access → revoke cycle.
  // Requires OWNER_KEY (to mint and revoke) and an invite-visibility file in
  // the library. STRANGER_KEY enables the stranger-with-valid-invite cell.
  // -------------------------------------------------------------------------

  const inviteFile = byVisibility.get('invite');
  if (OWNER_KEY && inviteFile) {
    console.log(`\n--- positive invite path (${inviteFile.name}) ---`);

    const mintRes = await fetch(`${BASE}/library/${encodeURIComponent(AUTHOR)}/access-code`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OWNER_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'gate-matrix-test' }),
    });

    if (!mintRes.ok) {
      // If the endpoint doesn't exist yet (older deploy in the rolling
      // window), don't fail the whole run — just note and skip.
      const label = `mint access-code (POST /library/${AUTHOR}/access-code)`;
      if (mintRes.status === 404) {
        console.log(`  ↷ ${label} → 404 (endpoint not deployed yet — skipping)`);
      } else {
        console.log(`  ✗ ${label} → ${mintRes.status}`);
        failures.push(`${label}: ${mintRes.status}`);
        failed++;
      }
    } else {
      const minted = await mintRes.json() as { id: string; code: string };
      console.log(`  ✓ mint → id=${minted.id} code=${minted.code.slice(0, 8)}…`);
      passed++;

      // Stranger with valid invite → expects 200 (the positive path).
      if (STRANGER_KEY) {
        const goodAccessRes = await fetch(
          `${BASE}/library/${encodeURIComponent(AUTHOR)}/file/${encodeURIComponent(inviteFile.name)}?invite=${encodeURIComponent(minted.code)}`,
          { headers: { Authorization: `Bearer ${STRANGER_KEY}` } },
        );
        if (goodAccessRes.status === 200) {
          console.log(`  ✓ stranger + valid invite → 200`);
          passed++;
        } else {
          console.log(`  ✗ stranger + valid invite → ${goodAccessRes.status}, expected 200`);
          failures.push(`stranger + valid invite: ${goodAccessRes.status}`);
          failed++;
        }
      }

      // Owner can still revoke. Validates the DELETE endpoint.
      const revokeRes = await fetch(
        `${BASE}/library/${encodeURIComponent(AUTHOR)}/access-code/${encodeURIComponent(minted.id)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${OWNER_KEY}` } },
      );
      if (revokeRes.ok) {
        console.log(`  ✓ revoke`);
        passed++;
      } else {
        console.log(`  ✗ revoke → ${revokeRes.status}`);
        failures.push(`revoke: ${revokeRes.status}`);
        failed++;
      }

      // Revoked code must now deny. inviteValid=false → 401 invite_required.
      if (STRANGER_KEY) {
        const denyRes = await fetch(
          `${BASE}/library/${encodeURIComponent(AUTHOR)}/file/${encodeURIComponent(inviteFile.name)}?invite=${encodeURIComponent(minted.code)}`,
          { headers: { Authorization: `Bearer ${STRANGER_KEY}` } },
        );
        if (denyRes.status === 401) {
          console.log(`  ✓ stranger + revoked invite → 401`);
          passed++;
        } else {
          console.log(`  ✗ stranger + revoked invite → ${denyRes.status}, expected 401`);
          failures.push(`stranger + revoked invite: ${denyRes.status}`);
          failed++;
        }
      }
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[gate-matrix] error:', err);
  process.exit(1);
});
