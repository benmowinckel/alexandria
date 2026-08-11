/** Regression contract for the one community membership definition. */

import assert from 'node:assert/strict';
import { classifyMembershipStatus } from '../src/billing.js';

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

console.log('membership contract: ok');
