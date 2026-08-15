/**
 * Static structural contract for the human profile editor.
 *
 * This deliberately tests the boundary rather than the current UI behavior:
 * the browser may reach presentation controls plus the exact PLM-scope ceiling;
 * each Worker write must re-authenticate the immutable account owner; artifact
 * bodies, visibility, grants, and publishing remain outside this surface.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), '..');
const proxy = readFileSync(resolve(root, 'app/api/library/[author]/[control]/route.ts'), 'utf8');
const page = readFileSync(resolve(root, 'app/library/[author]/client.tsx'), 'utf8');
const config = readFileSync(resolve(root, 'app/lib/config.ts'), 'utf8');
const library = readFileSync(resolve(process.cwd(), 'src/library.ts'), 'utf8');
const limits = readFileSync(resolve(process.cwd(), 'src/library-limits.ts'), 'utf8');

const controls = [...proxy.matchAll(/^\s+'([^']+)',$/gm)].map((match) => match[1]);
assert.deepEqual(controls, [
  'profile',
  'file-order',
  'file-subtitles',
  'twin',
]);

for (const forbidden of ['file-visibility', 'access-code', '/grant', 'file-categories', 'file-questions']) {
  assert.equal(page.includes(forbidden), false, `profile editor must not expose ${forbidden}`);
}
assert.match(page, /context: \{ scopes: contextScopes \}/);
assert.match(page, /see the exact context/);
assert.match(page, /each folder stands alone/);

assert.match(page, /data\.viewer\?\.is_owner/);
assert.match(page, />edit profile<\/HeaderAction>/);
assert.match(page, /saving \? 'saving changes' : 'save changes'/);
assert.match(page, /reorderWithinSection/);
assert.match(page, /start your loop/);
assert.doesNotMatch(page, /copy this stand|start with Benjamin’s stand|FOUNDER_STAND/);
assert.doesNotMatch(config, /FOUNDER_STAND/);
assert.match(page, /DEFAULT_CATEGORIES/);
assert.doesNotMatch(page, /const CATEGORIES =/);
assert.match(limits, /LIBRARY_MAX_PROFILE_CATEGORIES = 50/);
assert.match(limits, /LIBRARY_MAX_PROFILE_SOCIALS = 20/);
assert.match(limits, /LIBRARY_MAX_METADATA_ENTRIES = LIBRARY_MAX_FILES_PER_ACCOUNT/);
assert.match(library, /function librarySocialLinks/);
assert.match(library, /settings\.socials as unknown\[\]\)\.slice\(0, LIBRARY_MAX_PROFILE_SOCIALS\)/);
assert.match(library, /parsed\.protocol === 'http:' \|\| parsed\.protocol === 'https:'/);
assert.match(library, /Object\.entries\(body\.categories \|\| \{\}\)\.slice\(0, LIBRARY_MAX_METADATA_ENTRIES\)/);
assert.match(library, /Object\.entries\(body\.subtitles \|\| \{\}\)\.slice\(0, LIBRARY_MAX_METADATA_ENTRIES\)/);
assert.match(library, /Object\.entries\(body\.questions \|\| \{\}\)\.slice\(0, LIBRARY_MAX_METADATA_ENTRIES\)/);

const directoryAuthor = library.slice(
  library.indexOf('function directoryAuthor'),
  library.indexOf('function fileAccessUrl'),
);
assert.match(directoryAuthor, /location_key: libraryLocationKey\(location\)/);
assert.doesNotMatch(directoryAuthor, /stringSlot\(settings, 'location_key'\)/);

// A renamed GitHub handle remains a permanent route alias through the sticky
// login index, but profile presentation data is keyed by the account's current
// login. After resolving the immutable owner, the route must never use the
// requested alias for a D1/KV/twin read or for response metadata.
const profileRoute = library.slice(
  library.indexOf("app.get('/library/:author',"),
  library.indexOf("app.post('/library/:author/checkout/file/:name'"),
);
assert.match(profileRoute, /const requestedAuthorId = c\.req\.param\('author'\)/);
assert.match(profileRoute, /getAccountByLogin\(requestedAuthorId\)/);
assert.match(profileRoute, /const authorId = account!\.github_login/);
const canonicalProfileReads = profileRoute.slice(profileRoute.indexOf('const authorId = account!.github_login'));
assert.doesNotMatch(canonicalProfileReads, /\brequestedAuthorId\b/);

const ownerGate = library.slice(
  library.indexOf('async function isHandleOwner'),
  library.indexOf("app.post('/library/:author/access-code'"),
);
assert.match(ownerGate, /getAccountByLogin\(authorId\)/);
assert.match(ownerGate, /String\(ownerId\) === String\(accessor\.github_id\)/);
assert.match(ownerGate, /Authentication required/);
assert.match(ownerGate, /403/);

for (const control of controls) {
  const method = control === 'twin' ? 'post' : 'put';
  const marker = `app.${method}('/library/:author/${control}'`;
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

console.log('profile boundary: owner-only presentation + exact PLM scopes; no content, publication, or grant writes');
