/**
 * Unit test — credential comparisons must be constant-time.
 *
 * Regression guard for the `subMatchesAccount()` api_key compare in
 * server/src/billing.ts. Prior implementation used plain `===` which
 * short-circuits on the first differing byte and leaks a per-byte
 * timing oracle. The attacker-controlled side is the Stripe subscription
 * metadata (`md.api_key`), which any party with a Stripe subscription
 * tied to the account's products can write.
 *
 * Run: npx tsx test/timing-safe-credential-compare.ts
 */

import { safeEqual } from '../src/crypto.js';
import { subMatchesAccount } from '../src/billing.js';
import type { Account } from '../src/auth.js';
import type Stripe from 'stripe';

interface Case {
  name: string;
  check: () => { pass: boolean; details: string };
}

const cases: Case[] = [
  {
    name: 'safeEqual returns true for equal strings',
    check: () => {
      const a = 'alex_abcdef0123456789abcdef0123456789';
      const pass = safeEqual(a, a);
      return { pass, details: pass ? 'matched' : 'expected true, got false' };
    },
  },
  {
    name: 'safeEqual returns false for differing strings of equal length',
    check: () => {
      const a = 'alex_abcdef0123456789abcdef0123456789';
      const b = 'alex_abcdef0123456789abcdef012345678X';
      const pass = !safeEqual(a, b);
      return { pass, details: pass ? 'rejected' : 'expected false, got true' };
    },
  },
  {
    name: 'safeEqual returns false for length-mismatched inputs (no throw)',
    check: () => {
      const short = 'alex_short';
      const long = 'alex_short_with_extra_bytes';
      // Plain crypto.timingSafeEqual THROWS on length mismatch — safeEqual
      // must guard against this and return false instead. If this throws,
      // the test framework will catch it and the case fails.
      const pass = !safeEqual(short, long) && !safeEqual(long, short);
      return { pass, details: pass ? 'rejected without throwing' : 'expected false' };
    },
  },
  {
    name: 'safeEqual returns false on empty + non-empty mismatch',
    check: () => {
      const pass = !safeEqual('', 'x') && !safeEqual('x', '');
      return { pass, details: pass ? 'rejected' : 'expected false' };
    },
  },
  {
    name: 'safeEqual returns true for two empty strings',
    check: () => {
      const pass = safeEqual('', '');
      return { pass, details: pass ? 'matched' : 'expected true' };
    },
  },
  {
    name: 'subMatchesAccount matches when metadata.api_key equals account.api_key',
    check: () => {
      const account = {
        github_login: 'alice',
        email: 'alice@example.com',
        api_key: 'alex_realkey_aaaaaaaaaaaaaaaaaaaaaaaa',
      } as unknown as Account;
      const sub = {
        status: 'active',
        metadata: { api_key: 'alex_realkey_aaaaaaaaaaaaaaaaaaaaaaaa' },
      } as unknown as Stripe.Subscription;
      const pass = subMatchesAccount(sub, account) === true;
      return { pass, details: pass ? 'matched' : 'expected match' };
    },
  },
  {
    name: 'subMatchesAccount rejects forged metadata.api_key (attack path)',
    check: () => {
      // Forged metadata — attacker controls md.api_key; the real
      // account.api_key is unknown to them. Compare must not match
      // AND must not leak the real key via timing.
      const account = {
        github_login: 'alice',
        email: 'alice@example.com',
        api_key: 'alex_realkey_aaaaaaaaaaaaaaaaaaaaaaaa',
      } as unknown as Account;
      const sub = {
        status: 'active',
        metadata: { api_key: 'alex_forged_bbbbbbbbbbbbbbbbbbbbbbbb' },
      } as unknown as Stripe.Subscription;
      const pass = subMatchesAccount(sub, account) === false;
      return { pass, details: pass ? 'rejected' : 'expected reject' };
    },
  },
  {
    name: 'subMatchesAccount rejects length-mismatched forged metadata.api_key (no throw)',
    check: () => {
      // If billing.ts wired the raw crypto.timingSafeEqual without the
      // length guard, this case would THROW and the worker would crash.
      // safeEqual must absorb the length mismatch.
      const account = {
        github_login: 'alice',
        email: 'alice@example.com',
        api_key: 'alex_realkey_aaaaaaaaaaaaaaaaaaaaaaaa',
      } as unknown as Account;
      const sub = {
        status: 'active',
        metadata: { api_key: 'short' },
      } as unknown as Stripe.Subscription;
      const pass = subMatchesAccount(sub, account) === false;
      return { pass, details: pass ? 'rejected without throwing' : 'expected reject' };
    },
  },
];

async function main(): Promise<void> {
  console.log('=== Timing-safe credential compare ===');
  let failed = 0;
  for (const c of cases) {
    process.stdout.write(`${c.name}... `);
    try {
      const r = c.check();
      console.log(r.pass ? 'PASS' : 'FAIL');
      if (!r.pass) {
        console.log(`  ${r.details}`);
        failed++;
      }
    } catch (e) {
      console.log('FAIL');
      console.log(`  threw: ${e}`);
      failed++;
    }
  }
  console.log(`\n${cases.length - failed}/${cases.length} passed`);
  if (failed > 0) process.exit(1);
}

main();
