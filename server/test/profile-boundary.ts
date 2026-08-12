/**
 * Static structural contract for the human profile editor.
 *
 * This deliberately tests the boundary rather than the current UI behavior:
 * the browser may only reach presentation controls; each Worker write must
 * re-authenticate the immutable account owner; bodies and visibility remain
 * outside this surface.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), '..');
const proxy = readFileSync(resolve(root, 'app/api/library/[author]/[control]/route.ts'), 'utf8');
const page = readFileSync(resolve(root, 'app/library/[author]/client.tsx'), 'utf8');
const library = readFileSync(resolve(process.cwd(), 'src/library.ts'), 'utf8');

const controls = [...proxy.matchAll(/^\s+'([^']+)',$/gm)].map((match) => match[1]);
assert.deepEqual(controls, [
  'profile',
  'file-order',
  'file-subtitles',
]);

for (const forbidden of ['file-visibility', 'access-code', '/grant', '/twin', 'file-categories', 'file-questions']) {
  assert.equal(page.includes(forbidden), false, `profile editor must not expose ${forbidden}`);
}

assert.match(page, /data\.viewer\?\.is_owner/);
assert.match(page, /editing \? 'save' : 'edit'/);
assert.match(page, /reorderWithinSection/);

const directoryAuthor = library.slice(
  library.indexOf('function directoryAuthor'),
  library.indexOf('function fileAccessUrl'),
);
assert.match(directoryAuthor, /location_key: libraryLocationKey\(location\)/);
assert.doesNotMatch(directoryAuthor, /stringSlot\(settings, 'location_key'\)/);

const ownerGate = library.slice(
  library.indexOf('async function isHandleOwner'),
  library.indexOf("app.post('/library/:author/access-code'"),
);
assert.match(ownerGate, /getAccountByLogin\(authorId\)/);
assert.match(ownerGate, /String\(ownerId\) === String\(accessor\.github_id\)/);
assert.match(ownerGate, /Authentication required/);
assert.match(ownerGate, /403/);

for (const control of controls) {
  const marker = `app.put('/library/:author/${control}'`;
  const start = library.indexOf(marker);
  assert.notEqual(start, -1, `${control} endpoint must exist`);
  const nextRoute = library.indexOf('\n  app.', start + marker.length);
  const handler = library.slice(start, nextRoute === -1 ? undefined : nextRoute);
  const gate = handler.indexOf('resolveOwnerOnly(c, authorId)');
  const firstWrite = Math.min(
    ...['getKV().put(', '.run();'].map((needle) => {
      const index = handler.indexOf(needle);
      return index === -1 ? Number.POSITIVE_INFINITY : index;
    }),
  );
  assert.notEqual(gate, -1, `${control} must authenticate its owner`);
  assert.ok(gate < firstWrite, `${control} must authenticate before writing`);
}

console.log('profile boundary: owner-only presentation controls; no content or permission writes');
