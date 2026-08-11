/**
 * Production community-loop verification.
 *
 * Read-only checks always run. When the supplied account is authoritatively
 * active, the test also publishes, reads back, byte-compares, and deletes one
 * internal canary file. The fixed internal name never enters Library listings
 * or aggregate signal, and cleanup runs in finally.
 *
 * Usage: npm run test:community
 * Env: TEST_URL, TEST_SITE_URL, TEST_AUTHOR_ID, OWNER_API_KEY
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const API = process.env.TEST_URL || 'https://api.alexandria-library.com';
const SITE = process.env.TEST_SITE_URL || 'https://alexandria-library.com';
const AUTHOR = process.env.TEST_AUTHOR_ID || 'benmowinckel';
const fallbackKey = join(process.env.HOME || '', 'alexandria', 'system', '.api_key');
const KEY = (process.env.OWNER_API_KEY || (existsSync(fallbackKey) ? readFileSync(fallbackKey, 'utf8') : '')).trim();
const auth = KEY ? { Authorization: `Bearer ${KEY}` } : {};

async function json<T>(path: string, init: RequestInit = {}): Promise<{ response: Response; body: T }> {
  const response = await fetch(`${API}${path}`, init);
  const text = await response.text();
  let body: T;
  try { body = JSON.parse(text) as T; }
  catch { throw new Error(`${path} returned non-JSON (${response.status}): ${text.slice(0, 200)}`); }
  return { response, body };
}

async function main() {
  const checks: string[] = [];

  const site = await fetch(`${SITE}/join`, { redirect: 'manual' });
  assert.ok(site.status >= 200 && site.status < 400, `/join unavailable: ${site.status}`);
  checks.push('join page');

  const oauth = await fetch(`${API}/auth/github`, { redirect: 'manual' });
  assert.equal(oauth.status, 302, 'GitHub join did not start with a redirect');
  assert.match(oauth.headers.get('location') || '', /^https:\/\/github\.com\/login\/oauth\/authorize\?/);
  assert.match(oauth.headers.get('set-cookie') || '', /alex_oauth_state=/);
  checks.push('OAuth start + CSRF cookie');

  const spec = await json<any>('/alexandria');
  assert.equal(spec.response.status, 200);
  assert.equal(spec.body.version, '1.1');
  assert.match(spec.body.community?.account || '', /not separate memberships/);
  checks.push('machine-readable community contract');

  const catalog = await json<any>('/marketplace');
  assert.equal(catalog.response.status, 200);
  assert.ok(Array.isArray(catalog.body.modules) && catalog.body.modules.length > 0, 'Marketplace catalog empty');
  assert.ok(catalog.body.modules.some((m: any) => m.tier === 'core'));
  assert.ok(catalog.body.modules.some((m: any) => m.tier === 'default'));
  checks.push('human/AI Marketplace catalog');

  const capabilities = await json<any>(`/library/${encodeURIComponent(AUTHOR)}/capabilities`);
  assert.equal(capabilities.response.status, 200);
  assert.equal(capabilities.body.schema, 'alexandria.library.capabilities.v1');
  assert.equal(capabilities.body.inference?.company_token_fallback, false);
  checks.push('Library controls, shadows, permissions, own-token contract');

  const handoff = await json<any>(`/library/${encodeURIComponent(AUTHOR)}/handoff`);
  assert.equal(handoff.response.status, 200);
  assert.ok(typeof handoff.body.shadow === 'string');
  assert.match(handoff.body.instructions || '', /public shadow/i);
  checks.push('public AI handoff');

  const firstModule = catalog.body.modules.find((m: any) => m.tier !== 'core' && m.id);
  assert.ok(firstModule, 'No inspectable Marketplace module');
  const unauthorizedSignal = await fetch(`${API}/marketplace/${encodeURIComponent(firstModule.id)}`);
  assert.equal(unauthorizedSignal.status, 401, 'Marketplace private signal leaked without auth');
  checks.push('Marketplace signal auth gate');

  if (KEY) {
    const [status, session] = await Promise.all([
      json<any>('/alexandria', { headers: auth }),
      json<any>('/library/session', { headers: auth }),
    ]);
    assert.equal(status.response.status, 200);
    assert.equal(session.response.status, 200);
    assert.equal(status.body.account.github_login, session.body.github_login);
    assert.equal(status.body.account.membership_active, session.body.membership_active);
    assert.equal(status.body.account.status, session.body.subscription_status);
    checks.push('one authoritative account/membership state');

    if (status.body.account.membership_active) {
      const signal = await json<any>(`/marketplace/${encodeURIComponent(firstModule.id)}`, { headers: auth });
      assert.equal(signal.response.status, 200);
      assert.ok(signal.body.signal || signal.body.current_version, 'Marketplace aggregate signal missing');
      assert.ok(Array.isArray(signal.body.own_usage));
      assert.equal(JSON.stringify(signal.body).includes('account_id'), false, 'another caller identity is exposed');
      checks.push('anonymous aggregate + own-only usage history');
    } else {
      const signal = await fetch(`${API}/marketplace/${encodeURIComponent(firstModule.id)}`, { headers: auth });
      assert.equal(signal.status, 402, `inactive member signal should be 402, got ${signal.status}`);
      checks.push('private Marketplace signal denied for inactive membership');
    }

    const canaryName = 'ci-smoke';
    const canary = `# community loop canary\n\n${new Date().toISOString()}\n`;
    if (status.body.account.membership_active) {
      try {
        const put = await fetch(`${API}/file/${canaryName}`, {
          method: 'PUT',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: canary, visibility: 'authors' }),
        });
        assert.equal(put.status, 200, `active-member publish failed: ${put.status}`);
        const read = await fetch(`${API}/library/${encodeURIComponent(AUTHOR)}/file/${canaryName}`, { headers: auth });
        assert.equal(read.status, 200, `owner read-back failed: ${read.status}`);
        assert.equal(await read.text(), canary, 'read-back bytes differ from published bytes');
        checks.push('active-member write → gated read → exact bytes');
      } finally {
        const del = await fetch(`${API}/file/${canaryName}`, { method: 'DELETE', headers: auth });
        assert.equal(del.status, 200, `canary cleanup failed: ${del.status}`);
      }
    } else {
      const denied = await fetch(`${API}/file/${canaryName}`, {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: canary, visibility: 'authors' }),
      });
      assert.equal(denied.status, 402, `inactive member write should be 402, got ${denied.status}`);
      checks.push('inactive-member write denied from live Stripe truth');
    }

    const monitor = await json<any>('/admin/community-loop', { headers: auth });
    if (monitor.response.status === 200) {
      assert.equal(typeof monitor.body.accounts?.total, 'number');
      assert.equal(typeof monitor.body.referrals?.active, 'number');
      assert.ok(Array.isArray(monitor.body.issues));
      checks.push('account/referral/activity monitor');
    }
  }

  console.log(`community loop: ${checks.length} checks passed`);
  for (const check of checks) console.log(`  ✓ ${check}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
