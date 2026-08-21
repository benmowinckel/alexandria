import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import marketplaceInventory from '../../factory/marketplace.json';
import moduleSystem from '../../factory/module-system.json';
import {
  canonicalizeModuleId,
  deriveMarketplaceTier,
  isMarketplaceModule,
  marketplaceBuiltins,
  moduleIdAliases,
  normalizeMarketplaceReport,
  parseFrontmatter,
} from '../src/marketplace-catalog.js';

const currentDefault = 'github:benmowinckel/alexandria#factory/canon/methodology';

assert.equal(
  canonicalizeModuleId('github:mowinckelb/alexandria#factory/canon/methodology'),
  currentDefault,
);
assert.equal(
  canonicalizeModuleId('github:mowinckelb/alexandria-systems#verify-edit'),
  'github:benmowinckel/alexandria-modules#verify-edit',
);
assert.equal(
  canonicalizeModuleId('github:someone/alexandria-systems#verify-edit'),
  'github:someone/alexandria-systems#verify-edit',
);

for (const name of ['axioms', 'methodology', 'editor', 'mercury', 'publisher']) {
  assert.equal(
    deriveMarketplaceTier(`github:benmowinckel/alexandria#factory/canon/${name}`),
    'default',
  );
}
assert.equal(
  deriveMarketplaceTier('github:benmowinckel/alexandria#factory/canon/foundation'),
  'core',
);
assert.equal(
  deriveMarketplaceTier('github:benmowinckel/alexandria#factory/systems/capture-pipeline'),
  'official',
);
assert.equal(
  deriveMarketplaceTier('github:benmowinckel/alexandria-modules#verify-edit'),
  'community',
);
assert.equal(
  deriveMarketplaceTier('github:someone/their-modules#focus'),
  'community',
);

assert.deepEqual(moduleIdAliases(currentDefault), [
  currentDefault,
  'github:mowinckelb/alexandria#factory/canon/methodology',
]);
assert.equal(new Set(moduleIdAliases('github:benmowinckel/alexandria-modules#verify-edit')).size, 4);
assert.equal(isMarketplaceModule('github:benmowinckel/alexandria#factory/canon/foundation'), false);
assert.equal(isMarketplaceModule('github:mowinckelb/alexandria#factory/canon/foundation'), false);
assert.equal(isMarketplaceModule(currentDefault), true);
assert.equal(isMarketplaceModule('github:benmowinckel/alexandria#factory/canon/library'), false);
assert.equal(isMarketplaceModule('github:benmowinckel/alexandria#factory/canon/stand'), false);
assert.equal(isMarketplaceModule('github:benmowinckel/alexandria-modules#optimise'), false);
assert.equal(isMarketplaceModule('github:benmowinckel/alexandria#factory/canon/bookshelf'), true);
assert.equal(isMarketplaceModule('github:someone/their-modules#focus'), true);

const builtins = marketplaceBuiltins();
assert.equal(marketplaceInventory.author.name, 'Benjamin a. Mowinckel');
assert.equal(marketplaceInventory.author.github_login, 'benmowinckel');
assert.equal(builtins.every((module) => module.author_name === marketplaceInventory.author.name), true);
for (const inventoryModule of marketplaceInventory.modules) {
  const source = new URL(`../../${inventoryModule.path}.md`, import.meta.url);
  assert.equal(existsSync(source), true, `marketplace source missing: ${inventoryModule.path}.md`);
}
assert.deepEqual(
  marketplaceInventory.modules.filter((module) => module.role === 'core').map((module) => module.path),
  ['factory/canon/foundation', 'factory/canon/change-closure'],
);

assert.equal(moduleSystem.version, 2);
assert.deepEqual(
  moduleSystem.groups.core.items.map((module) => module.id),
  ['foundation', 'upkeep'],
);
assert.deepEqual(
  moduleSystem.groups.methods.items.map((module) => module.id).sort(),
  marketplaceInventory.modules
    .filter((module) => module.role === 'default')
    .map((module) => module.name)
    .sort(),
);
assert.deepEqual(
  moduleSystem.groups.additions.items.map((module) => module.id).sort(),
  marketplaceInventory.modules
    .filter((module) => module.role === 'official')
    .map((module) => module.name)
    .sort(),
);
assert.equal(moduleSystem.groups.additions.default_state, 'off_until_useful');
assert.equal(moduleSystem.groups.connections.default_state, 'off_until_exact_approval');
assert.equal(moduleSystem.groups.connections.items.some((module) => module.id === 'plm'), true);
assert.equal(moduleSystem.rules.private_data, 'never_needed_for_module_discovery');
for (const group of [moduleSystem.groups.core, moduleSystem.groups.methods, moduleSystem.groups.connections]) {
  for (const moduleEntry of group.items) {
    if (!('local_ref' in moduleEntry) || !moduleEntry.local_ref.startsWith('canon/')) continue;
    assert.equal(existsSync(new URL(`../../factory/${moduleEntry.local_ref}`, import.meta.url)), true, `module map reference missing: ${moduleEntry.local_ref}`);
  }
}
assert.deepEqual(
  marketplaceInventory.modules.filter((module) => module.role === 'default').map((module) => module.path).sort(),
  [
    'factory/canon/axioms',
    'factory/canon/editor',
    'factory/canon/mercury',
    'factory/canon/methodology',
    'factory/canon/publisher',
  ].sort(),
);
assert.deepEqual(
  builtins.map(({ name, tier }) => [name, tier]),
  [
    ['foundation', 'core'],
    ['upkeep', 'core'],
    ['axioms', 'default'],
    ['editor', 'default'],
    ['mercury', 'default'],
    ['methodology', 'default'],
    ['publisher', 'default'],
    ['capture', 'official'],
    ['audit', 'official'],
    ['bookshelf', 'community'],
  ],
);

const frontmatter = parseFrontmatter(`---
name: focus
description: A reusable focus loop.
adaptation: personalizable
derived_from: github:someone/base#focus
---
# Focus
`);
assert.equal(frontmatter.adaptation, 'personalizable');
assert.equal(frontmatter.derived_from, 'github:someone/base#focus');
assert.deepEqual(
  builtins.map((module) => module.adaptation),
  marketplaceInventory.modules.map((module) => module.adaptation),
);

const exactHash = 'A'.repeat(64);
assert.deepEqual(normalizeMarketplaceReport([
  { id: 'github:someone/tools#focus', text: 'kept', source_sha256: exactHash, relationship: 'adapted' },
  { id: 'github:someone/tools#focus', text: 'duplicate', source_sha256: exactHash.toLowerCase() },
  { id: 'github:someone/tools#bad', text: '', source_sha256: 'not-a-hash' },
  'local:someone/private',
]), [{
  mod: 'github:someone/tools#focus',
  text: 'kept',
  sourceSha256: exactHash.toLowerCase(),
  relationship: 'adapted',
}]);

assert.deepEqual(normalizeMarketplaceReport([
  { id: 'github:someone/tools#focus', text: 'kept in spirit', relationship: 'adapted' },
]), [{
  mod: 'github:someone/tools#focus',
  text: 'kept in spirit',
  sourceSha256: null,
  relationship: 'adapted',
}]);

assert.deepEqual(normalizeMarketplaceReport([
  { id: 'github:someone/tools#focus', text: 'unchanged', source_sha256: exactHash },
]), [{
  mod: 'github:someone/tools#focus',
  text: 'unchanged',
  sourceSha256: exactHash.toLowerCase(),
  relationship: 'exact',
}]);

console.log('marketplace catalog identity, lifecycle, and activation layers: PASS');
