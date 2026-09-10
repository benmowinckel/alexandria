import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Exercise the release script's actual traps without executing its signing,
// Git, network or credential paths. The foreground child makes the signal
// arrive while Bash is waiting, as it does during release checks.
const source = await readFile(new URL('./push.sh', import.meta.url), 'utf8');
const traps = source.split('\n').filter(line => /^trap /.test(line)).join('\n');
assert.ok(traps, 'Release signal traps must exist');
const directory = await mkdtemp(join(tmpdir(), 'alexandria-release-signals-'));

try {
  for (const [signal, expectedCode] of [[null, 0], ['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
    const marker = join(directory, signal || 'normal');
    const script = `set -euo pipefail
marker="$1"
cleanup() { printf 'cleanup\\n' >> "$marker"; }
${traps}
printf 'first-step\\n' >> "$marker"
"$2" -e 'process.stdout.write("ready\\n"); setTimeout(() => {}, 150)'
printf 'second-step\\n' >> "$marker"
`;
    const child = spawn('/bin/bash', ['-c', script, 'release-signal-test', marker, process.execPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    let sent = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      if (signal && !sent && output.includes('ready\n')) {
        sent = true;
        child.kill(signal);
      }
    });
    child.stderr.on('data', chunk => { errors += chunk; });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
    let outcome;
    try {
      outcome = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, exitSignal) => resolve({ code, exitSignal }));
      });
    } finally { clearTimeout(timeout); }
    assert.equal(outcome.exitSignal, null, `${signal || 'normal'} must exit through its handler: ${errors}`);
    assert.equal(outcome.code, expectedCode, `${signal || 'normal'} exit status: ${errors}`);
    if (signal) assert.equal(sent, true, `${signal} was delivered during the foreground step`);
    assert.equal(await readFile(marker, 'utf8'), signal
      ? 'first-step\ncleanup\n'
      : 'first-step\nsecond-step\ncleanup\n', `${signal || 'normal'} runs cleanup once and never resumes after cancellation`);
  }
  console.log('Release signals: INT/TERM/HUP terminate, cleanup runs once, and no later release step runs.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
