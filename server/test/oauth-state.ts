import assert from 'node:assert/strict';
import { createOAuthState, readOAuthState } from '../src/oauth-state.js';

const secret = 'test-github-client-secret';
const context = {
  ref: 'friend',
  ref_source: 'join',
  ref_id: 'campaign-1',
  next: '/library?locations=sf',
  intent: 'library',
  waive: 'private-waiver-token',
};

const created = createOAuthState(secret, context);
assert.match(created.state, /^[a-f0-9]{32}$/);
assert.ok(created.cookieValue.startsWith(`${created.state}.`));
assert.deepEqual(readOAuthState(secret, created.state, created.cookieValue), context);
const tamperedState = `${created.state[0] === '0' ? '1' : '0'}${created.state.slice(1)}`;
assert.equal(readOAuthState(secret, tamperedState, created.cookieValue), null);
assert.equal(readOAuthState('wrong-secret', created.state, created.cookieValue), null);

const parts = created.cookieValue.split('.');
assert.equal(readOAuthState(secret, created.state, `${parts[0]}.${parts[1]}x.${parts[2]}`), null);
assert.equal(readOAuthState(secret, created.state, `${parts[0]}.${parts[1]}.${parts[2]}x`), null);
assert.ok(!created.state.includes(context.waive), 'GitHub-visible state must not expose OAuth context');
assert.ok(created.cookieValue.length < 4096, 'OAuth state cookie must fit browser limits');

console.log('oauth state: signed browser context without KV race');
