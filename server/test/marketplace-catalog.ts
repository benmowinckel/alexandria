import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import marketplaceInventory from '../../factory/marketplace.json';
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
assert.equal(isMarketplaceModule('github:benmowinckel/alexandria-modules#optimise'), false);
assert.equal(isMarketplaceModule('github:benmowinckel/alexandria#factory/canon/bookshelf'), true);
assert.equal(isMarketplaceModule('github:someone/their-modules#focus'), true);

const builtins = marketplaceBuiltins();
for (const module of marketplaceInventory.modules) {
  const source = new URL(`../../${module.path}.md`, import.meta.url);
  assert.equal(existsSync(source), true, `marketplace source missing: ${module.path}.md`);
}
assert.deepEqual(
  marketplaceInventory.modules.filter((module) => module.role === 'core').map((module) => module.path),
  ['factory/canon/foundation', 'factory/canon/change-closure'],
);
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
  { id: 'github:someone/tools#focus', text: 'kept', source_sha256: exactHash },
  { id: 'github:someone/tools#focus', text: 'duplicate', source_sha256: exactHash.toLowerCase() },
  { id: 'github:someone/tools#bad', text: '', source_sha256: 'not-a-hash' },
  'local:someone/private',
]), [{
  mod: 'github:someone/tools#focus',
  text: 'kept',
  sourceSha256: exactHash.toLowerCase(),
}]);

console.log('marketplace catalog identity, lifecycle, and activation layers: PASS');
