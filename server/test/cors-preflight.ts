/**
 * CORS preflight test — exercises the worker in-process via app.fetch,
 * no socket or bindings required (preflights return before any env use).
 *
 * Motivated by hono 4.12.25 / GHSA-88fw-hqm2-52qc (hono/cors reflecting
 * arbitrary Origins with Access-Control-Allow-Credentials). We use
 * hand-rolled CORS middleware, not hono/cors, but this pins the contract:
 * a disallowed Origin must never be reflected, and credentials must never
 * be granted to it — across hono upgrades.
 *
 * Usage: npx tsx test/cors-preflight.ts
 */

import worker from '../src/worker.js';

const BASE = 'https://api.alexandria-library.com';
const ALLOWED_ORIGIN = 'https://alexandria-library.com';
const EVIL_ORIGIN = 'https://evil.example.com';

let failed = 0;

function check(name: string, ok: boolean, details = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !details ? '' : ` — ${details}`}`);
  if (!ok) failed++;
}

async function preflight(path: string, origin: string): Promise<Response> {
  const req = new Request(`${BASE}${path}`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
  });
  // Preflights short-circuit in middleware before any binding access.
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  return worker.fetch(req, {}, ctx as never);
}

async function main() {
  for (const path of ['/library/test', '/check-kin']) {
    const evil = await preflight(path, EVIL_ORIGIN);
    check(
      `${path} preflight rejects disallowed origin`,
      evil.status === 403,
      `status ${evil.status}`,
    );
    check(
      `${path} does not reflect disallowed origin`,
      evil.headers.get('Access-Control-Allow-Origin') === null,
      `ACAO=${evil.headers.get('Access-Control-Allow-Origin')}`,
    );
    check(
      `${path} does not grant credentials to disallowed origin`,
      evil.headers.get('Access-Control-Allow-Credentials') === null,
      `ACAC=${evil.headers.get('Access-Control-Allow-Credentials')}`,
    );

    const good = await preflight(path, ALLOWED_ORIGIN);
    check(
      `${path} preflight accepts allowed origin`,
      good.status === 204,
      `status ${good.status}`,
    );
    check(
      `${path} echoes exactly the allowed origin`,
      good.headers.get('Access-Control-Allow-Origin') === ALLOWED_ORIGIN,
      `ACAO=${good.headers.get('Access-Control-Allow-Origin')}`,
    );
    check(
      `${path} sets Vary: Origin for allowed origin`,
      (good.headers.get('Vary') || '').includes('Origin'),
      `Vary=${good.headers.get('Vary')}`,
    );
  }

  console.log(failed === 0 ? '\nAll CORS preflight checks passed.' : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
