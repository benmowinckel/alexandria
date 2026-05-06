/**
 * Server integration smoke test — validates current Alexandria routes.
 * No API key required. Safe to run on local dev server.
 *
 * Usage: npx tsx test/server.ts
 */

const BASE = process.env.TEST_URL || 'http://localhost:8787';

interface TestResult {
  test: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function test(name: string, fn: () => Promise<TestResult>) {
  process.stdout.write(`${name}... `);
  try {
    const result = await fn();
    results.push(result);
    console.log(result.passed ? 'PASS' : 'FAIL');
    if (!result.passed) console.log(`  ${result.details}`);
  } catch (err) {
    const result = { test: name, passed: false, details: `Error: ${err}` };
    results.push(result);
    console.log('FAIL');
    console.log(`  ${result.details}`);
  }
}

async function main() {
  console.log('=== Alexandria Server Test ===');
  console.log(`Target: ${BASE}\n`);

  await test('Health endpoint', async () => {
    const res = await fetch(`${BASE}/health`);
    const body = await safeJson(res);
    const status = typeof body?.status === 'string' ? body.status : '';
    const hasComponents = !!body?.components && typeof body.components === 'object';
    // Degraded is a FAILURE — a healthy system must report 'ok', not 'degraded'
    const allComponentsOk = hasComponents && Object.values(body!.components as Record<string, string>).every(v => v === 'ok');
    const brokenComponents = hasComponents
      ? Object.entries(body!.components as Record<string, string>).filter(([, v]) => v !== 'ok').map(([k, v]) => `${k}=${v}`)
      : [];
    return {
      test: 'Health endpoint',
      passed: res.ok && status === 'ok' && allComponentsOk,
      details: status === 'degraded'
        ? `DEGRADED — broken: ${brokenComponents.join(', ')}`
        : `HTTP ${res.status}, status: ${status}, components ok: ${allComponentsOk}`,
    };
  });

  await test('Protocol endpoint (/alexandria)', async () => {
    const res = await fetch(`${BASE}/alexandria`);
    const body = await safeJson(res);
    return {
      test: 'Protocol endpoint',
      passed: res.ok && body?.protocol === 'alexandria' && typeof body?.version === 'string',
      details: `HTTP ${res.status}, protocol: ${String(body?.protocol)}, version: ${String(body?.version)}`,
    };
  });

  await test('Protocol file publish requires auth', async () => {
    const res = await fetch(`${BASE}/file/test`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'test' }),
    });
    return {
      test: 'Protocol file publish requires auth',
      passed: res.status === 401,
      details: `HTTP ${res.status}`,
    };
  });

  await test('Protocol call requires auth', async () => {
    const res = await fetch(`${BASE}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modules: ['test'] }),
    });
    return {
      test: 'Protocol call requires auth',
      passed: res.status === 401,
      details: `HTTP ${res.status}`,
    };
  });

  await test('Protocol marketplace listing is public', async () => {
    const res = await fetch(`${BASE}/marketplace`);
    const body = await res.json().catch(() => null) as { modules?: unknown } | null;
    return {
      test: 'Protocol marketplace listing is public',
      passed: res.status === 200 && Array.isArray(body?.modules),
      details: `HTTP ${res.status}, modules=${Array.isArray(body?.modules) ? 'array' : 'missing'}`,
    };
  });

  await test('Analytics endpoint enforces auth', async () => {
    const res = await fetch(`${BASE}/analytics`);
    return {
      test: 'Analytics endpoint enforces auth',
      passed: res.status === 401,
      details: `HTTP ${res.status}`,
    };
  });

  await test('Waitlist validates email', async () => {
    const res = await fetch(`${BASE}/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    return {
      test: 'Waitlist validates email',
      passed: res.status === 400,
      details: `HTTP ${res.status}`,
    };
  });

  await test('GitHub OAuth endpoint redirects to GitHub', async () => {
    const res = await fetch(`${BASE}/auth/github`, { redirect: 'manual' });
    const location = res.headers.get('location') || '';
    const isRedirect = (res.status === 301 || res.status === 302) && location.includes('github.com/login/oauth');
    // 500 on local dev (no GITHUB_CLIENT_ID) — only acceptable on localhost
    const isLocalOnly = BASE.includes('localhost') || BASE.includes('127.0.0.1');
    const isAcceptableLocalError = isLocalOnly && res.status === 500;
    return {
      test: 'GitHub OAuth endpoint',
      passed: isRedirect || isAcceptableLocalError,
      details: isAcceptableLocalError
        ? 'SKIP — localhost, no GitHub secrets (acceptable)'
        : isRedirect
          ? `redirects to GitHub (${res.status})`
          : `HTTP ${res.status} — OAuth broken on production`,
    };
  });

  await test('Root page returns HTML', async () => {
    const res = await fetch(`${BASE}/`);
    const body = await res.text();
    const hasTitle = body.includes('<title>Alexandria</title>');
    const hasTagline = body.includes('Greek philosophy infrastructure');
    return {
      test: 'Root page returns HTML',
      passed: res.ok && hasTitle && hasTagline,
      details: `HTTP ${res.status}, title: ${hasTitle}, tagline: ${hasTagline}`,
    };
  });

  console.log('\n=== RESULTS ===\n');
  let allPassed = true;
  for (const r of results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.test}`);
    if (!r.passed) {
      console.log(`       ${r.details}`);
      allPassed = false;
    }
  }
  console.log(`\n${allPassed ? 'All tests passed.' : 'Some tests failed.'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
