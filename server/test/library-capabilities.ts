/**
 * Pure structural tests for the Library capability contract and the two access
 * boundaries that used to rely on silent defaults / stale membership state.
 * Run: npx tsx test/library-capabilities.ts (from server/)
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  acceptsAuthorSidecar,
  inferenceEnvForAuthor,
  libraryLocationOptions,
  libraryCapabilityContract,
} from '../src/library.js';
import { canonicalLibraryLocation } from '../../shared/library-locations.js';
import { resolveTwinVariants } from '../src/twin.js';

assert.equal(canonicalLibraryLocation('new yorkk'), 'New York');
assert.equal(canonicalLibraryLocation('SAN FRANCISCO'), 'San Francisco');
assert.equal(canonicalLibraryLocation('not a real place'), null);
assert.equal(new Set(libraryLocationOptions()).size, libraryLocationOptions().length);

const env = {
  DEFAULT_TWIN_CHECKPOINT: 'tinker://company',
  DEFAULT_TWIN_BASE: 'company-base',
  DEFAULT_TWIN_CONTEXT_MODEL: 'company-model',
};

assert.deepEqual(inferenceEnvForAuthor('someone', env, 'founder'), {});
assert.deepEqual(inferenceEnvForAuthor('founder', env, 'founder'), env);
assert.equal(acceptsAuthorSidecar('someone', { url: 'https://own.example', secret: 'x' }, 'founder'), false);
assert.equal(acceptsAuthorSidecar('someone', { url: 'https://own.example', secret: 'x', owner_account: true }, 'founder'), true);
assert.equal(acceptsAuthorSidecar('founder', { url: 'https://founder.example', secret: 'x' }, 'founder'), true);

const promptBoundary = resolveTwinVariants({
  twin: {
    weights: { enabled: true, checkpoint: 'tinker://mine', system: 'hidden private prompt' },
    context: { enabled: true, model: 'my-model', system: 'hidden private prompt', scopes: [42, 'invite/friends'] },
  },
});
assert.equal('system' in promptBoundary.weights, false);
assert.equal('system' in promptBoundary.context, false);
assert.deepEqual(promptBoundary.context.scopes, ['invite/friends']);

const contract = libraryCapabilityContract({
  authorId: 'someone', viewerRole: 'owner', ownInferenceRequired: true,
  inferenceConnected: false, twinEnabled: false,
});
assert.equal(contract.schema, 'alexandria.library.capabilities.v2');
assert.equal(contract.inference.ownership, 'author_account_only');
assert.equal(contract.inference.company_token_fallback, false);
assert.equal(contract.inference.connected, false);
assert.equal(contract.viewer_role, 'owner');
assert.match(contract.profile.owner_page, /\/library\/someone$/);
assert.match(contract.browse.public_handoff, /\/library\/someone\/handoff$/);
assert.match(contract.browse.member_directory, /\/library$/);
assert.match(contract.browse.rule, /authoritative active membership/);
assert.equal(contract.scopes.inheritance, false);
assert.match(contract.scopes.metadata, /invisible without the exact grant/);
assert.match(contract.scopes.permissions.invite, /exact live invite-scope grant/);
assert.match(contract.scopes.permissions.authors, /authoritatively active/);
assert.match(contract.inference.context_rule, /configured PLM scopes.*viewer access.*active artifact access/);
assert.equal(contract.inference.hidden_context_fields, false);
assert.match(contract.inference.audit, /context-preview$/);
assert.equal(contract.owner_api.inference_sidecar.required_body_acknowledgement.own_account, true);

const ownerPage = resolve(process.cwd(), '..', 'app', 'library', '[author]', 'page.tsx');
assert.equal(existsSync(ownerPage), true, 'capability contract must not advertise a dead owner page');

console.log('Library capability contract: 25 checks passed');
