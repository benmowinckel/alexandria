import assert from 'node:assert/strict';
import {
  canonicalizeModuleId,
  deriveMarketplaceTier,
  isMarketplaceModule,
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
  deriveMarketplaceTier('github:benmowinckel/alexandria#factory/canon/library'),
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

console.log('marketplace catalog identity and activation layers: PASS');
