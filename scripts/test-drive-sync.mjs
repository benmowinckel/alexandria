import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alexandria-drive-test-'));
const bin = path.join(root, 'bin');
const alexandria = path.join(root, 'alexandria');

try {
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(alexandria, 'system'), { recursive: true });
  fs.mkdirSync(path.join(alexandria, 'files/constitution'), { recursive: true });
  fs.writeFileSync(path.join(alexandria, 'system/.drive-start.md'), '# _start\n');
  fs.writeFileSync(
    path.join(alexandria, 'files/constitution/_constitution.md'),
    '# Constitution\n\n## Core\n\nA position.\n\n## Mind\n\nAnother.\n',
  );

  const fakeRclone = `#!/bin/bash
cmd=""
for arg in "$@"; do
  case "$arg" in about|sync|copy|copyto) cmd="$arg"; break ;; esac
done
[ "$cmd" = about ] && exit 0
if [ "$cmd" = sync ]; then
  args=("$@")
  for ((i=0; i<\${#args[@]}; i++)); do
    if [ "\${args[$i]}" = sync ]; then dest="\${args[$((i+2))]}"; fi
  done
  if [[ "$dest" != *:* ]]; then
    mkdir -p "$dest"
    printf 'revision %s\n' "\${FAKE_REV:-1}" > "$dest/capture.md"
  fi
fi
exit 0
`;
  fs.writeFileSync(path.join(bin, 'rclone'), fakeRclone, { mode: 0o755 });

  const run = (revision) => spawnSync('bash', ['factory/scripts/drive_sync.sh'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      ALEXANDRIA_DIR: alexandria,
      FAKE_REV: String(revision),
    },
    encoding: 'utf8',
  });

  for (const revision of [1, 1, 2]) {
    const result = run(revision);
    if (result.status !== 0) {
      throw new Error(`drive sync failed:\n${result.stdout}\n${result.stderr}`);
    }
  }

  const inbox = path.join(alexandria, 'files/vault/input/chat');
  const captures = fs.readdirSync(inbox);
  if (captures.length !== 6) {
    throw new Error(`expected 6 captures (3 homes × 2 content versions), got ${captures.length}`);
  }

  const status = fs.readFileSync(path.join(alexandria, 'system/.drive_sync_status'), 'utf8').trim();
  if (!status.startsWith('DRIVE SYNC OK')) throw new Error(status);

  const controller = fs.readFileSync('factory/scripts/drive_ctl.sh', 'utf8');
  if (!controller.includes('ALEXANDRIA_DRIVE_REMOTE:-alexandria-drive')) {
    throw new Error('Drive bridge does not use its own rclone remote name');
  }
  if (controller.indexOf('bash "$SYNC"') > controller.indexOf('launchctl bootstrap')) {
    throw new Error('scheduler can race the first Drive sync');
  }
  const syncSource = fs.readFileSync('factory/scripts/drive_sync.sh', 'utf8');
  if (!syncSource.includes('mkdir "$REMOTE:$ROOT/$folder"')) {
    throw new Error('first sync does not create empty Drive homes');
  }

  console.log(JSON.stringify({ runs: 3, captures: captures.length, status }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
