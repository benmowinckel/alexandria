import assert from 'node:assert/strict';
import {
  canListLibraryArtifact,
  effectiveLibraryScopes,
  libraryArtifactKey,
  normalizeLibraryScope,
  visibilityForScope,
} from '../src/library-scopes.js';

assert.equal(normalizeLibraryScope(undefined, 'public'), 'public');
assert.equal(normalizeLibraryScope('invite/friends', 'public'), 'invite/friends');
assert.equal(normalizeLibraryScope('invite/../private', 'public'), null);
assert.equal(normalizeLibraryScope('invite/Friends', 'public'), null);
assert.equal(visibilityForScope('paid/course'), 'paid');
assert.equal(libraryArtifactKey('invite/friends', 'shadow'), 'invite/friends/shadow');

const providerScopes = [
  'public',
  'authors',
  'invite',
  'invite/friends',
  'invite/investors',
  'paid/course',
];

assert.deepEqual(effectiveLibraryScopes({
  providerScopes,
  grantedScopes: [],
  subscriberValid: false,
  owner: false,
}), ['public']);

assert.deepEqual(effectiveLibraryScopes({
  providerScopes,
  grantedScopes: ['invite/friends'],
  subscriberValid: false,
  owner: false,
}), ['public', 'invite/friends']);

// The load-bearing rule: a base invite never opens friends or investors, and
// a friends grant never opens its sibling.
assert.deepEqual(effectiveLibraryScopes({
  providerScopes,
  grantedScopes: ['invite'],
  subscriberValid: false,
  owner: false,
}), ['public', 'invite']);

assert.deepEqual(effectiveLibraryScopes({
  providerScopes,
  grantedScopes: ['invite/friends', 'paid/course'],
  subscriberValid: true,
  owner: false,
}), ['public', 'authors', 'invite/friends', 'paid/course']);

assert.deepEqual(effectiveLibraryScopes({
  providerScopes,
  grantedScopes: ['invite/friends', 'paid/course'],
  subscriberValid: true,
  owner: false,
  publicOnly: true,
}), ['public']);

assert.deepEqual(effectiveLibraryScopes({
  providerScopes,
  grantedScopes: [],
  subscriberValid: false,
  owner: true,
}), providerScopes);

assert.equal(canListLibraryArtifact({
  scope: 'public', grantedScopes: [], subscriberValid: false, owner: false,
}), true);
assert.equal(canListLibraryArtifact({
  scope: 'paid/course', grantedScopes: [], subscriberValid: false, owner: false,
}), true);
assert.equal(canListLibraryArtifact({
  scope: 'authors', grantedScopes: [], subscriberValid: false, owner: false,
}), false);
assert.equal(canListLibraryArtifact({
  scope: 'authors', grantedScopes: [], subscriberValid: true, owner: false,
}), true);
assert.equal(canListLibraryArtifact({
  scope: 'invite/friends', grantedScopes: ['invite'], subscriberValid: true, owner: false,
}), false);
assert.equal(canListLibraryArtifact({
  scope: 'invite/friends', grantedScopes: ['invite/friends'], subscriberValid: false, owner: false,
}), true);
assert.equal(canListLibraryArtifact({
  scope: 'invite/investors', grantedScopes: ['invite/friends'], subscriberValid: false, owner: false,
}), false);
assert.equal(canListLibraryArtifact({
  scope: 'invite/investors', grantedScopes: [], subscriberValid: false, owner: true,
}), true);

console.log('library scope boundary passed');
