/**
 * Product lifecycle test - verifies the full user journey works end-to-end.
 * Uses a real API key to test what an actual Author experiences.
 *
 * Tests the chain: handshake -> factory artifacts -> protocol obligations
 * -> machine signal/feedback -> local machine files.
 *
 * Usage: npx tsx test/lifecycle.ts
 * Requires: ~/alexandria/system/.api_key (a real account)
 * Set TEST_URL to override (default: https://api.mowinckel.ai)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const BASE = process.env.TEST_URL || 'https://api.mowinckel.ai';
const HOME = process.env.HOME || process.env.USERPROFILE || '';
const ALEX_DIR = join(HOME, 'alexandria');
const FILES_DIR = join(ALEX_DIR, 'files');
const CORE_DIR = join(FILES_DIR, 'core');
const SYS_DIR = join(ALEX_DIR, 'system');
const API_KEY_PATH = join(SYS_DIR, '.api_key');
const FACTORY_RAW = 'https://raw.githubusercontent.com/mowinckelb/alexandria/main/factory';

interface TestResult {
  test: string;
  passed: boolean;
  details: string;
}

interface DashboardSnapshot {
  hasStructure: boolean;
  status: string;
  serverErrors24h: number;
  parseErrors: number;
  invariantIssues: string[];
  telemetryStale: boolean;
  totalEvents: number | null;
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

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function snapshotDashboard(body: Record<string, unknown>): DashboardSnapshot {
  const runtime = body.runtime as Record<string, unknown> | undefined;
  const verification = body.verification as Record<string, unknown> | undefined;

  return {
    hasStructure: !!runtime
      && typeof runtime.server_errors_24h === 'number'
      && !!verification
      && typeof body.total_events === 'number',
    status: typeof body.status === 'string' ? body.status : '',
    serverErrors24h: runtime && typeof runtime.server_errors_24h === 'number'
      ? runtime.server_errors_24h
      : 0,
    parseErrors: typeof body.parse_errors === 'number' ? body.parse_errors : 0,
    invariantIssues: Array.isArray(body.invariant_issues)
      ? body.invariant_issues.filter((x): x is string => typeof x === 'string')
      : [],
    telemetryStale: !!(body.telemetry_health as Record<string, unknown> | undefined)?.stale,
    totalEvents: typeof body.total_events === 'number' ? body.total_events : null,
  };
}

async function main() {
  console.log('=== Alexandria Product Lifecycle Test ===');
  console.log(`Target: ${BASE}\n`);

  // Pre-check: API key exists
  if (!existsSync(API_KEY_PATH)) {
    console.log('SKIP: No API key found at ~/alexandria/system/.api_key');
    console.log('This test requires a real Alexandria account.');
    process.exit(0);
  }
  const apiKey = readFileSync(API_KEY_PATH, 'utf-8').trim();
  const headers = { Authorization: `Bearer ${apiKey}` };
  let baselineDashboard: DashboardSnapshot | null = null;

  // -----------------------------------------------------------------------
  // PHASE 1: Server health
  // -----------------------------------------------------------------------
  console.log('Phase 1: Server health');

  await test('Health endpoint reports fully healthy', async () => {
    const res = await fetch(`${BASE}/health`);
    const body = await safeJson(res);
    const status = typeof body?.status === 'string' ? body.status : '';
    const components = (body?.components || {}) as Record<string, string>;
    const brokenComponents = Object.entries(components)
      .filter(([, v]) => v !== 'ok')
      .map(([k, v]) => `${k}=${v}`);

    return {
      test: 'Health endpoint',
      passed: res.ok && status === 'ok' && brokenComponents.length === 0,
      details: status === 'degraded'
        ? `DEGRADED - broken: ${brokenComponents.join(', ')}`
        : `status=${status}, all components ok`,
    };
  });

  // Capture dashboard baseline so this test flags regressions introduced now,
  // not unrelated pre-existing production issues.
  try {
    const baselineRes = await fetch(`${BASE}/analytics/dashboard`, { headers });
    const baselineBody = baselineRes.ok ? await safeJson(baselineRes) : null;
    if (baselineBody) baselineDashboard = snapshotDashboard(baselineBody);
  } catch {
    baselineDashboard = null;
  }

  // -----------------------------------------------------------------------
  // PHASE 2: Protocol handshake + methodology source
  // -----------------------------------------------------------------------
  console.log('\nPhase 2: Handshake + methodology');

  let methodologyUrl = `${FACTORY_RAW}/canon/methodology.md`;

  await test('Handshake exposes protocol spec', async () => {
    const res = await fetch(`${BASE}/alexandria`);
    const body = await safeJson(res);
    if (typeof body?.methodology === 'string' && body.methodology.length > 0) {
      methodologyUrl = body.methodology;
    }

    const endpoints = (body?.endpoints || {}) as Record<string, string>;
    const hasCoreEndpoints = endpoints.file === '/file/{name}'
      && endpoints.call === '/call'
      && endpoints.library === '/library/{id}'
      && endpoints.marketplace === '/marketplace';

    return {
      test: 'Handshake exposes protocol spec',
      passed: res.ok && body?.protocol === 'alexandria' && hasCoreEndpoints,
      details: `HTTP ${res.status}, protocol=${String(body?.protocol)}, has core endpoints=${hasCoreEndpoints}`,
    };
  });

  await test('Authenticated handshake returns account status', async () => {
    const res = await fetch(`${BASE}/alexandria`, { headers });
    const body = await safeJson(res);

    const connected = body?.connected === true;
    const obligations = (body?.obligations || {}) as Record<string, unknown>;
    const hasObligations = typeof obligations.file_status === 'string'
      && typeof obligations.call_status === 'string';

    return {
      test: 'Authenticated handshake',
      passed: res.ok && connected && hasObligations,
      details: `HTTP ${res.status}, connected=${String(body?.connected)}, obligations=${hasObligations}`,
    };
  });

  await test('Methodology URL is reachable and non-trivial', async () => {
    const res = await fetch(methodologyUrl);
    const body = await res.text();
    const lower = body.toLowerCase();
    const hasAxioms = lower.includes('axiom');
    const hasFiveOps = lower.includes('five operation') || lower.includes('operation craft');

    return {
      test: 'Methodology URL',
      passed: res.ok && body.length > 1000 && hasAxioms && hasFiveOps,
      details: `HTTP ${res.status}, ${body.length} bytes, axioms=${hasAxioms}, five_ops=${hasFiveOps}`,
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 3: Factory hooks artifacts
  // -----------------------------------------------------------------------
  console.log('\nPhase 3: Factory hooks');

  await test('Factory shim is fetchable and executable', async () => {
    const res = await fetch(`${FACTORY_RAW}/hooks/shim.sh`);
    const body = await res.text();
    const hasShebang = body.startsWith('#!/usr/bin/env bash');
    const hasModes = body.includes('session-start') && body.includes('session-end') && body.includes('subagent');
    const fetchesPayload = body.includes('factory/hooks/payload.sh');

    return {
      test: 'Factory shim',
      passed: res.ok && hasShebang && hasModes && fetchesPayload,
      details: `HTTP ${res.status}, shebang=${hasShebang}, modes=${hasModes}, payload_ref=${fetchesPayload}`,
    };
  });

  await test('Factory payload includes all 5 context layers', async () => {
    const res = await fetch(`${FACTORY_RAW}/hooks/payload.sh`);
    const body = await res.text();
    const hasConstitution = body.includes('constitution');
    const hasOntology = body.includes('ontology');
    const hasMachine = body.includes('machine.md');
    const hasNotepad = body.includes('notepad.md');
    const hasFeedback = body.includes('feedback.md');

    return {
      test: 'Factory payload context layers',
      passed: res.ok && hasConstitution && hasOntology && hasMachine && hasNotepad && hasFeedback,
      details: `constitution=${hasConstitution}, ontology=${hasOntology}, machine=${hasMachine}, notepad=${hasNotepad}, feedback=${hasFeedback}`,
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 4: Protocol obligations + machine signals
  // -----------------------------------------------------------------------
  console.log('\nPhase 4: Protocol obligations');

  const stamp = Date.now();
  const fileName = `lifecycle-${stamp}`;
  // Use github: format so the public listing (which filters to github:%) reflects this call.
  // The repo path is fictitious — the listing aggregates protocol_calls, not GitHub reachability.
  const moduleId = `github:lifecycle-test/repo#mod-${stamp}`;
  const callText = `Lifecycle call verification ${stamp}`;

  await test('File obligation write accepted', async () => {
    const res = await fetch(`${BASE}/file/${fileName}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `# Lifecycle ${stamp}\n\nProtocol file obligation verification.`,
        text: `lifecycle ${stamp}`,
      }),
    });
    const body = await safeJson(res);
    return {
      test: 'File write',
      passed: res.ok && body?.ok === true,
      details: `HTTP ${res.status}, ok=${String(body?.ok)}`,
    };
  });

  await test('Call obligation accepted', async () => {
    const res = await fetch(`${BASE}/call`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modules: [{ id: moduleId, text: callText }],
      }),
    });
    const body = await safeJson(res);
    return {
      test: 'Call obligation',
      passed: res.ok && body?.ok === true,
      details: `HTTP ${res.status}, ok=${String(body?.ok)}`,
    };
  });

  await test('Marketplace reflects protocol call (auth usage history)', async () => {
    const res = await fetch(`${BASE}/marketplace/${encodeURIComponent(moduleId)}`, { headers });
    const body = await safeJson(res);
    const usage = Array.isArray(body?.usage) ? body.usage as Array<{ text?: string }> : [];
    const found = usage.some((u) => typeof u.text === 'string' && u.text.includes(callText));

    return {
      test: 'Marketplace module feed',
      passed: res.ok && body?.module === moduleId && found,
      details: `HTTP ${res.status}, usage_count=${usage.length}, found=${found}`,
    };
  });

  await test('Marketplace listing (public) includes lifecycle module', async () => {
    const res = await fetch(`${BASE}/marketplace`);
    const body = await safeJson(res) as { modules?: Array<{ id: string; status: string; kind: string }>; total?: number; next_cursor?: string | null } | null;
    const modules = body?.modules || [];
    const entry = modules.find((m) => m.id === moduleId);

    // Public listing: catalog only — no usage telemetry. The lifecycle module
    // points at a fake repo so resolveModule correctly returns 'unreachable'
    // (github fetch fails). Envelope must carry total + next_cursor for the
    // forward-compat pagination contract.
    return {
      test: 'Marketplace listing',
      passed: res.ok
        && !!entry
        && entry.status === 'unreachable'
        && typeof entry.kind === 'string'
        && body?.total !== undefined
        && body?.next_cursor === null,
      details: `HTTP ${res.status}, found=${!!entry}, status=${entry?.status}, kind=${entry?.kind}, module_count=${modules.length}, total=${body?.total}, next_cursor=${body?.next_cursor}`,
    };
  });

  await test('Public marketplace strips private signal', async () => {
    // Confirm the public listing carries no usage_count / last_used / first_seen
    // / per-call text. Those are private Marketplace Signal exposed only via the
    // auth-gated /marketplace/:module endpoint.
    const res = await fetch(`${BASE}/marketplace`);
    const text = await res.text();
    const leaks = ['usage_count', 'last_used', 'first_seen']
      .filter((k) => text.includes(`"${k}"`));
    return {
      test: 'Public marketplace strips private signal',
      passed: res.ok && leaks.length === 0,
      details: leaks.length === 0 ? `HTTP ${res.status}, no private fields` : `HTTP ${res.status}, leaks: ${leaks.join(', ')}`,
    };
  });

  await test('Machine signal accepted', async () => {
    const res = await fetch(`${BASE}/marketplace/signal`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signal: `Lifecycle test signal ${stamp}: protocol obligations and marketplace flow are healthy.`,
      }),
    });
    const body = await safeJson(res);
    return {
      test: 'Machine signal',
      passed: res.ok && body?.ok === true,
      details: `HTTP ${res.status}, ok=${String(body?.ok)}`,
    };
  });

  await test('Feedback endpoint accepts session feedback', async () => {
    const res = await fetch(`${BASE}/feedback`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Lifecycle feedback ${stamp}: end-to-end flow verified.`,
        context: 'lifecycle-test',
      }),
    });
    const body = await safeJson(res);
    return {
      test: 'Feedback endpoint',
      passed: res.ok && body?.ok === true,
      details: `HTTP ${res.status}, ok=${String(body?.ok)}`,
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 5: Local machine files
  // -----------------------------------------------------------------------
  console.log('\nPhase 5: Local files');

  await test('Constitution directory exists with content', async () => {
    const constDir = join(FILES_DIR, 'constitution');
    const exists = existsSync(constDir);
    let fileCount = 0;
    let totalSize = 0;
    if (exists) {
      const { readdirSync, statSync } = await import('fs');
      const files = readdirSync(constDir).filter((f) => f.endsWith('.md') && f !== 'README.md');
      fileCount = files.length;
      for (const f of files) {
        totalSize += statSync(join(constDir, f)).size;
      }
    }
    return {
      test: 'Constitution directory',
      passed: exists && fileCount > 0 && totalSize > 100,
      details: `exists=${exists}, files=${fileCount}, total=${totalSize}b`,
    };
  });

  await test('Methodology cached locally with valid content', async () => {
    const canonPath = join(SYS_DIR, 'canon', 'methodology.md');
    const exists = existsSync(canonPath);
    let size = 0;
    let hasRequiredContent = false;
    if (exists) {
      const content = readFileSync(canonPath, 'utf-8');
      size = content.length;
      const lower = content.toLowerCase();
      hasRequiredContent = lower.includes('axiom') && (lower.includes('five operation') || lower.includes('operation craft'));
    }
    return {
      test: 'Methodology local cache',
      passed: exists && size > 1000 && hasRequiredContent,
      details: !exists
        ? 'MISSING - .canon_local does not exist (hooks have not run)'
        : !hasRequiredContent
          ? `exists but missing required sections (${size}b) - corrupted cache`
          : `valid: ${size}b, contains Axioms + Five Operations`,
    };
  });

  await test('Feedback file exists', async () => {
    const fbPath = join(CORE_DIR, 'feedback.md');
    const exists = existsSync(fbPath);
    return {
      test: 'Feedback file',
      passed: exists,
      details: `exists=${exists}`,
    };
  });

  await test('Machine.md exists', async () => {
    const machinePath = join(CORE_DIR, 'machine.md');
    const exists = existsSync(machinePath);
    let size = 0;
    if (exists) size = readFileSync(machinePath).length;
    return {
      test: 'Machine.md',
      passed: exists && size > 50,
      details: `exists=${exists}, size=${size}b`,
    };
  });

  await test('Notepad exists', async () => {
    const notepadPath = join(CORE_DIR, 'notepad.md');
    const exists = existsSync(notepadPath);
    return {
      test: 'Notepad',
      passed: exists,
      details: `exists=${exists}`,
    };
  });

  // -----------------------------------------------------------------------
  // PHASE 6: Dashboard (Marketplace verification)
  // -----------------------------------------------------------------------
  console.log('\nPhase 6: Marketplace');

  await test('Dashboard metrics did not regress during lifecycle run', async () => {
    let res = await fetch(`${BASE}/analytics/dashboard`, { headers });
    if (!res.ok) return { test: 'Dashboard', passed: false, details: `HTTP ${res.status}` };
    let body = await safeJson(res) || {};
    let current = snapshotDashboard(body);

    // Retry for edge propagation
    for (let attempt = 0; attempt < 2 && !current.hasStructure; attempt++) {
      await pause(1500);
      res = await fetch(`${BASE}/analytics/dashboard`, { headers });
      if (!res.ok) break;
      body = await safeJson(res) || {};
      current = snapshotDashboard(body);
    }

    if (!current.hasStructure) {
      return {
        test: 'Dashboard',
        passed: false,
        details: 'missing runtime/verification/total_events structure',
      };
    }

    if (!baselineDashboard || !baselineDashboard.hasStructure) {
      // No baseline available -> fall back to strict health-style check.
      const strictIssues: string[] = [];
      if (current.status.startsWith('degraded')) strictIssues.push(`status=${current.status}`);
      if (current.invariantIssues.length > 0) strictIssues.push(`invariants=${current.invariantIssues.join(',')}`);
      if (current.serverErrors24h > 0) strictIssues.push(`server_errors_24h=${current.serverErrors24h}`);
      if (current.parseErrors > 0) strictIssues.push(`parse_errors=${current.parseErrors}`);
      if (current.telemetryStale) strictIssues.push('telemetry_stale=true');
      return {
        test: 'Dashboard',
        passed: strictIssues.length === 0,
        details: strictIssues.length === 0
          ? `clean - ${current.totalEvents} events, status=${current.status}`
          : `ISSUES: ${strictIssues.join('; ')}`,
      };
    }

    const newInvariantIssues = current.invariantIssues
      .filter(i => !baselineDashboard!.invariantIssues.includes(i));
    const regressed = {
      status: baselineDashboard.status.startsWith('ok') && current.status.startsWith('degraded'),
      serverErrors: current.serverErrors24h > baselineDashboard.serverErrors24h,
      parseErrors: current.parseErrors > baselineDashboard.parseErrors,
      telemetry: current.telemetryStale && !baselineDashboard.telemetryStale,
      invariants: newInvariantIssues.length > 0,
    };
    const issues: string[] = [];
    if (regressed.status) issues.push(`status ${baselineDashboard.status} -> ${current.status}`);
    if (regressed.serverErrors) issues.push(`server_errors_24h ${baselineDashboard.serverErrors24h} -> ${current.serverErrors24h}`);
    if (regressed.parseErrors) issues.push(`parse_errors ${baselineDashboard.parseErrors} -> ${current.parseErrors}`);
    if (regressed.telemetry) issues.push('telemetry changed healthy -> stale');
    if (regressed.invariants) issues.push(`new invariant issues: ${newInvariantIssues.join(', ')}`);

    return {
      test: 'Dashboard',
      passed: issues.length === 0,
      details: issues.length > 0
        ? `REGRESSION: ${issues.join('; ')}`
        : `stable - status=${current.status}, server_errors_24h=${current.serverErrors24h}, parse_errors=${current.parseErrors}`,
    };
  });

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log('\n=== RESULTS ===\n');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  for (const r of results) {
    if (!r.passed) console.log(`  FAIL: ${r.test} - ${r.details}`);
  }
  console.log(`\n  ${passed} passed, ${failed} failed out of ${results.length}`);
  if (failed > 0) {
    console.log('\n  Product lifecycle has gaps. Fix before shipping to users.');
  } else {
    console.log('\n  Full product lifecycle verified.');
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
