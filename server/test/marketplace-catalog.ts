import assert from 'node:assert/strict';
import {
  canonicalizeModuleId,
  deriveMarketplaceTier,
  isMarketplaceModule,
  marketplaceBuiltins,
  moduleIdAliases,
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
assert.deepEqual(
  builtins.map(({ name, tier }) => [name, tier]),
  [
    ['foundation', 'core'],
    ['follow-through', 'core'],
    ['axioms', 'default'],
    ['editor', 'default'],
    ['mercury', 'default'],
    ['methodology', 'default'],
    ['publisher', 'default'],
    ['capture pipeline', 'official'],
    ['state-based sync', 'official'],
    ['bookshelf', 'community'],
  ],
);

console.log('marketplace catalog identity and activation layers: PASS');
