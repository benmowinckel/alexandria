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
  isLibraryCategory,
  libraryLocationOptions,
  libraryCapabilityContract,
} from '../src/library.js';
import { canonicalLibraryLocation } from '../../shared/library-locations.js';
import { resolveTwinVariants } from '../src/twin.js';
import {
  LIBRARY_MAX_FILE_BYTES,
  LIBRARY_MAX_FILES_PER_ACCOUNT,
  LIBRARY_MAX_METADATA_ENTRIES,
  LIBRARY_MAX_PROFILE_CATEGORIES,
  LIBRARY_MAX_PROFILE_SOCIALS,
  LIBRARY_MAX_STORAGE_BYTES_PER_ACCOUNT,
  libraryStorageWithinLimit,
  projectedLibraryStorageBytes,
} from '../src/library-limits.js';

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
assert.equal(contract.schema, 'alexandria.library.capabilities.v3');
assert.equal(isLibraryCategory('works'), true);
assert.equal(isLibraryCategory('field-notes'), true);
assert.equal(isLibraryCategory('Field Notes'), false);
assert.equal(isLibraryCategory('../private'), false);
assert.deepEqual(contract.profile.default_sections, ['works', 'projects', 'shadows', 'other']);
assert.match(contract.profile.custom_sections, /lowercase slug/);
assert.match(contract.profile.custom_surfaces, /separate surface/);
assert.match(contract.stand.module_id, /factory\/canon\/stand$/);
assert.match(contract.stand.rule, /starting point, not Library law/);
assert.equal(contract.inference.ownership, 'author_account_only');
assert.equal(contract.inference.company_token_fallback, false);
assert.equal(contract.inference.connected, false);
assert.equal(contract.viewer_role, 'owner');
assert.match(contract.profile.owner_page, /\/library\/someone$/);
assert.match(contract.browse.public_handoff, /\/library\/someone\/handoff$/);
assert.match(contract.browse.member_directory, /\/library$/);
assert.match(contract.browse.rule, /authoritative active membership/);
assert.equal(contract.scopes.inheritance, false);
assert.match(contract.scopes.metadata, /explicitly lists that exact artifact/);
assert.match(contract.scopes.metadata, /exact cohort, filename, questions, and body stay invisible/);
assert.deepEqual(contract.owner_api.file_listings, {
  method: 'PUT', path: '/library/someone/file-listings',
});
assert.match(contract.scopes.permissions.invite, /exact live invite-scope grant/);
assert.match(contract.scopes.permissions.authors, /authoritatively active/);
assert.match(contract.inference.context_rule, /configured PLM scopes.*viewer access.*active artifact access/);
assert.match(contract.inference.context_rule, /shadows are always-loaded unified context/);
assert.equal(contract.inference.sidecar_contract.context.request.works[0].category, 'shadows');
assert.equal(contract.inference.hidden_context_fields, false);
assert.match(contract.inference.audit, /context-preview$/);
assert.deepEqual(contract.owner_api.profile_self, {
  method: 'PUT', path: '/library/me/profile', response: { ok: true },
});
assert.equal('welcome_source' in contract.owner_api, false);
assert.equal(contract.owner_api.inference_sidecar.body.own_account, true);
assert.match(contract.inference.setup.module, /factory\/canon\/plm\.md$/);
assert.equal(contract.inference.sidecar_contract.context.path, '/agent');
assert.deepEqual(contract.inference.sidecar_contract.context.request.context_scopes, ['public']);
assert.match(contract.inference.sidecar_contract.hard_boundary, /no Author filesystem/);
assert.equal(contract.limits.files_per_account, LIBRARY_MAX_FILES_PER_ACCOUNT);
assert.equal(contract.limits.bytes_per_file, LIBRARY_MAX_FILE_BYTES);
assert.equal(contract.limits.bytes_per_account, LIBRARY_MAX_STORAGE_BYTES_PER_ACCOUNT);
assert.equal(contract.limits.presentation_entries, LIBRARY_MAX_METADATA_ENTRIES);
assert.equal(contract.limits.profile_sections, LIBRARY_MAX_PROFILE_CATEGORIES);
assert.equal(contract.limits.profile_links, LIBRARY_MAX_PROFILE_SOCIALS);
assert.equal(LIBRARY_MAX_METADATA_ENTRIES, LIBRARY_MAX_FILES_PER_ACCOUNT);
assert.equal(LIBRARY_MAX_PROFILE_CATEGORIES, 50);
assert.equal(LIBRARY_MAX_PROFILE_SOCIALS, 20);
assert.equal(projectedLibraryStorageBytes(200, 50, 75), 225);
assert.equal(projectedLibraryStorageBytes(10, 20, 5), 5);
assert.equal(libraryStorageWithinLimit(LIBRARY_MAX_STORAGE_BYTES_PER_ACCOUNT), true);
assert.equal(libraryStorageWithinLimit(LIBRARY_MAX_STORAGE_BYTES_PER_ACCOUNT + 1), false);

const ownerPage = resolve(process.cwd(), '..', 'app', 'library', '[author]', 'page.tsx');
assert.equal(existsSync(ownerPage), true, 'capability contract must not advertise a dead owner page');

console.log('Library capability contract: modular stand + exact-scope boundary passed');
