/**
 * Library API test — verifies publishing, reading, quizzes, and access control.
 * Uses a real API key to test the full Library lifecycle.
 *
 * Usage: npx tsx test/library.ts
 * Requires: ~/alexandria/system/.api_key (a real account)
 * Set TEST_URL to override (default: https://api.alexandria-library.com)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const BASE = process.env.TEST_URL || 'https://api.alexandria-library.com';
const HOME = process.env.HOME || process.env.USERPROFILE || '';
const API_KEY_PATH = join(HOME, 'alexandria', 'system', '.api_key');

interface TestResult {
  test: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<TestResult>) {
  process.stdout.write(`  ${name}... `);
  try {
    const result = await fn();
    results.push(result);
    console.log(result.passed ? 'PASS' : 'FAIL');
    if (!result.passed) console.log(`    ${result.details}`);
  } catch (err) {
    const result = { test: name, passed: false, details: `Error: ${err}` };
    results.push(result);
    console.log('FAIL');
    console.log(`    ${result.details}`);
  }
}

async function main() {
  console.log('=== Alexandria Library Test ===');
  console.log(`Target: ${BASE}\n`);

  if (!existsSync(API_KEY_PATH)) {
    console.log('SKIP: No API key found at ~/alexandria/system/.api_key');
    process.exit(0);
  }
  const apiKey = readFileSync(API_KEY_PATH, 'utf-8').trim();
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  // -----------------------------------------------------------------------
  // PHASE 1: Public endpoints (no auth)
  // -----------------------------------------------------------------------
  console.log('Phase 1: Public Library endpoints');

  // The catalog is the company layer over protocol accounts/files. Per-Author
  // URLs remain the canonical shelf for each Author.
  const authorId = process.env.TEST_AUTHOR_ID || 'mowinckelb';

  await test('Author catalog returns structured data', async () => {
    const res = await fetch(`${BASE}/library`);
    const body = await res.json() as { authors: unknown[] };
    return {
      test: 'Author catalog',
      passed: res.ok && Array.isArray(body.authors),
      details: `HTTP ${res.status}, authors: ${body.authors?.length || 0}`,
    };
  });

  await test('Author profile returns structured data', async () => {
    const res = await fetch(`${BASE}/library/${authorId}`);
    const body = await res.json() as { author: { id: string; display_name: string }; files: unknown[] };
    const hasAuthor = !!body.author?.id;
    const hasFiles = Array.isArray(body.files);
    return {
      test: 'Author profile',
      passed: res.ok && hasAuthor && hasFiles,
      details: `author: ${hasAuthor}, files: ${body.files?.length}`,
    };
  });

  await test('Author profile hides internal protocol test files', async () => {
    const res = await fetch(`${BASE}/library/${authorId}`);
    const body = await res.json() as { files?: Array<{ name: string }> };
    const names = (body.files || []).map(f => f.name);
    const leaked = names.filter(name =>
      /^lifecycle-\d+$/.test(name)
      || /^ci-smoke(?:-\d+)?$/.test(name)
      || name === 'smoke-test'
      || name === 'test-check'
    );
    return {
      test: 'Hide internal protocol files',
      passed: res.ok && leaked.length === 0,
      details: `HTTP ${res.status}, leaked: ${leaked.join(', ') || 'none'}`,
    };
  });

  await test('Free shadow accessible without auth', async () => {
    const res = await fetch(`${BASE}/library/${authorId}/shadow/free`);
    if (res.status === 404) {
      return { test: 'Free shadow', passed: true, details: 'No free shadow published (acceptable)' };
    }
    const body = await res.text();
    return {
      test: 'Free shadow',
      passed: res.ok && body.length > 50,
      details: `HTTP ${res.status}, size: ${body.length}`,
    };
  });

  await test('Paid shadow blocked without access', async () => {
    const res = await fetch(`${BASE}/library/${authorId}/shadow/paid`);
    // Should return 401 or 403 or metadata without content
    return {
      test: 'Paid shadow',
      passed: res.status === 401 || res.status === 403 || res.status === 404,
      details: `HTTP ${res.status} (correctly gated)`,
    };
  });

  await test('Nonexistent author returns 404', async () => {
    const res = await fetch(`${BASE}/library/nonexistent-test-author-xyz`);
    return {
      test: 'Nonexistent author',
      passed: res.status === 404,
      details: `HTTP ${res.status}`,
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 2: Pulse and quizzes
  // -----------------------------------------------------------------------
  console.log('\nPhase 2: Pulse and quizzes');

  await test('Pulse returns data or 404', async () => {
    const res = await fetch(`${BASE}/library/${authorId}/pulse`);
    if (res.status === 404) {
      return { test: 'Pulse', passed: true, details: 'No pulse published (acceptable)' };
    }
    const body = await res.text();
    return {
      test: 'Pulse',
      passed: res.ok && body.length > 10,
      details: `HTTP ${res.status}, size: ${body.length}`,
    };
  });

  let quizId = '';
  await test('Quizzes list returns data', async () => {
    const res = await fetch(`${BASE}/library/${authorId}/quizzes`);
    const body = await res.json() as { quizzes: Array<{ quiz_id: string }> };
    const hasQuizzes = Array.isArray(body.quizzes);
    if (hasQuizzes && body.quizzes.length > 0) quizId = body.quizzes[0].quiz_id;
    return {
      test: 'Quizzes list',
      passed: res.ok && hasQuizzes,
      details: `HTTP ${res.status}, quizzes: ${body.quizzes?.length || 0}`,
    };
  });

  await test('Quiz definition loads with questions', async () => {
    if (!quizId) return { test: 'Quiz def', passed: true, details: 'No quiz to test (acceptable)' };
    const res = await fetch(`${BASE}/library/${authorId}/quiz/${quizId}`);
    const body = await res.json() as { quiz_id: string; questions: unknown[] };
    const hasQuestions = Array.isArray(body.questions) && body.questions.length > 0;
    return {
      test: 'Quiz definition',
      passed: res.ok && hasQuestions,
      details: `HTTP ${res.status}, questions: ${body.questions?.length || 0}`,
    };
  });

  await test('Quiz submission returns result', async () => {
    if (!quizId) return { test: 'Quiz submit', passed: true, details: 'No quiz to test (acceptable)' };
    // Fetch quiz to get question IDs
    const qRes = await fetch(`${BASE}/library/${authorId}/quiz/${quizId}`);
    const quiz = await qRes.json() as { questions: Array<{ id: string; options: string[] }> };
    // Answer all questions with first option
    const answers: Record<string, string> = {};
    for (const q of quiz.questions) {
      answers[q.id] = 'A';
    }
    const res = await fetch(`${BASE}/library/${authorId}/quiz/${quizId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    const body = await res.json() as { score_pct: number; result_slug: string };
    return {
      test: 'Quiz submission',
      passed: res.ok && typeof body.score_pct === 'number' && !!body.result_slug,
      details: `HTTP ${res.status}, score: ${body.score_pct}%, slug: ${body.result_slug}`,
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 3: Authenticated Library operations
  // -----------------------------------------------------------------------
  console.log('\nPhase 3: Authenticated operations');

  await test('Protocol file publish works', async () => {
    const res = await fetch(`${BASE}/file/test-check`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content: '# Test\nLibrary test file.', text: 'test' }),
    });
    const body = await res.json() as { ok: boolean };
    return {
      test: 'Protocol file publish',
      passed: res.ok && body.ok,
      details: `HTTP ${res.status}`,
    };
  });

  await test('Author stats accessible with auth', async () => {
    const res = await fetch(`${BASE}/library/${authorId}/stats`, { headers });
    if (res.status === 404) {
      return { test: 'Stats', passed: true, details: 'No stats yet (acceptable)' };
    }
    const body = await res.json() as Record<string, unknown>;
    return {
      test: 'Stats',
      passed: res.ok,
      details: `HTTP ${res.status}, keys: ${Object.keys(body).join(',')}`,
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 4: Access control edge cases
  // -----------------------------------------------------------------------
  console.log('\nPhase 4: Access control');

  await test('Protocol file rejects no auth', async () => {
    const res = await fetch(`${BASE}/file/test`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"content":"test"}' });
    return {
      test: 'Protocol file no auth',
      passed: res.status === 401,
      details: `HTTP ${res.status}`,
    };
  });

  // (Removed stale test for POST /marketplace/signal — that route was deleted
  // 2026-05-15; anonymous machine signal now flows through authed POST /call.)

  await test('Feedback rejects no auth', async () => {
    const res = await fetch(`${BASE}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test' }),
    });
    return {
      test: 'Feedback no auth',
      passed: res.status === 401,
      details: `HTTP ${res.status}`,
    };
  });

  await test('Waitlist rate limiting works', async () => {
    const email = `ratetest-${Date.now()}@example.com`;
    // Send 6 requests rapidly
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${BASE}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      statuses.push(res.status);
    }
    const has429 = statuses.some(s => s === 429);
    return {
      test: 'Waitlist rate limit',
      passed: has429,
      details: `statuses: [${statuses.join(',')}], hit 429: ${has429}`,
    };
  });

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log('\n=== RESULTS ===\n');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  for (const r of results) {
    if (!r.passed) console.log(`  FAIL: ${r.test} — ${r.details}`);
  }
  console.log(`\n  ${passed} passed, ${failed} failed out of ${results.length}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
