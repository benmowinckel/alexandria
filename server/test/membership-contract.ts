/** Regression contract for the one community membership definition. */

import assert from 'node:assert/strict';
import { classifyMembershipStatus, isManageableSubscriptionStatus } from '../src/billing.js';

const activeStripe = ['trialing', 'active', 'past_due'];
for (const status of activeStripe) {
  assert.deepEqual(classifyMembershipStatus('canceled', status), {
    active: true,
    status,
    source: 'stripe',
  });
}

for (const status of ['canceled', 'unpaid', 'incomplete', 'paused']) {
  assert.deepEqual(classifyMembershipStatus('active', status), {
    active: false,
    status,
    source: 'stripe',
  }, `live Stripe ${status} must override stale KV active`);
}

for (const status of ['free', 'beta']) {
  assert.deepEqual(classifyMembershipStatus(status), {
    active: true,
    status,
    source: 'grandfathered',
  });
}

assert.deepEqual(classifyMembershipStatus('active'), {
  active: false,
  status: 'active',
  source: 'none',
}, 'stored paid status alone is never authority');

for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete']) {
  assert.equal(isManageableSubscriptionStatus(status), true, `${status} may remain the cached current subscription`);
}
for (const status of ['canceled', 'incomplete_expired']) {
  assert.equal(isManageableSubscriptionStatus(status), false, `${status} must fall through to find a newer live subscription`);
}

console.log('membership contract: ok');
