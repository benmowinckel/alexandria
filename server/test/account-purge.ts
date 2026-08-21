import assert from 'node:assert';
import { AccountPurgeError, runAccountPurge, type AccountPurgeStage } from '../src/account-purge.js';

const stages: AccountPurgeStage[] = ['billing', 'database', 'files', 'access'];

async function runWithFailure(failingStage?: AccountPurgeStage): Promise<string[]> {
  const calls: string[] = [];
  const step = (stage: AccountPurgeStage) => async () => {
    calls.push(stage);
    if (stage === failingStage) throw new Error(`${stage} unavailable`);
  };

  try {
    await runAccountPurge({
      cancelBilling: step('billing'),
      deleteDatabaseData: step('database'),
      deleteStoredFiles: step('files'),
      revokeAccess: step('access'),
    });
    assert.strictEqual(failingStage, undefined);
  } catch (error) {
    assert(error instanceof AccountPurgeError);
    assert.strictEqual(error.stage, failingStage);
  }

  return calls;
}

assert.deepStrictEqual(await runWithFailure(), stages);

for (const [index, stage] of stages.entries()) {
  assert.deepStrictEqual(
    await runWithFailure(stage),
    stages.slice(0, index + 1),
    `${stage} failure must stop before any later destructive step`,
  );
}

console.log('  5 account-purge ordering tests passed');
