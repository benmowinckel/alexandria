/**
 * CORS preflight regression test. Exercises the Worker in-process; preflights
 * return before any runtime binding is read.
 */

import worker from '../src/worker.js';

const BASE = 'https://api.alexandria-library.com';
const ALLOWED_ORIGIN = 'https://alexandria-library.com';
const DISALLOWED_ORIGIN = 'https://evil.example.com';

let failed = 0;

function check(name: string, ok: boolean, details = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !details ? '' : ` — ${details}`}`);
  if (!ok) failed++;
}

async function preflight(path: string, origin: string): Promise<Response> {
  const request = new Request(`${BASE}${path}`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
  });
  const context = { waitUntil() {}, passThroughOnException() {} };
  return worker.fetch(request, {}, context as never);
}

async function main() {
  for (const path of ['/library/test', '/check-kin']) {
    const disallowed = await preflight(path, DISALLOWED_ORIGIN);
    check(`${path} rejects a disallowed origin`, disallowed.status === 403, `status ${disallowed.status}`);
    check(
      `${path} does not reflect a disallowed origin`,
      disallowed.headers.get('Access-Control-Allow-Origin') === null,
      `ACAO=${disallowed.headers.get('Access-Control-Allow-Origin')}`,
    );
    check(
      `${path} does not grant credentials to a disallowed origin`,
      disallowed.headers.get('Access-Control-Allow-Credentials') === null,
      `ACAC=${disallowed.headers.get('Access-Control-Allow-Credentials')}`,
    );

    const allowed = await preflight(path, ALLOWED_ORIGIN);
    check(`${path} accepts the allowed origin`, allowed.status === 204, `status ${allowed.status}`);
    check(
      `${path} returns exactly the allowed origin`,
      allowed.headers.get('Access-Control-Allow-Origin') === ALLOWED_ORIGIN,
      `ACAO=${allowed.headers.get('Access-Control-Allow-Origin')}`,
    );
    check(
      `${path} varies the response by origin`,
      (allowed.headers.get('Vary') || '').includes('Origin'),
      `Vary=${allowed.headers.get('Vary')}`,
    );
  }

  console.log(failed === 0 ? '\nAll CORS preflight checks passed.' : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
