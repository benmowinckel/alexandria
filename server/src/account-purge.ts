export type AccountPurgeStage = 'billing' | 'database' | 'files' | 'access';

export class AccountPurgeError extends Error {
  constructor(
    public readonly stage: AccountPurgeStage,
    cause: unknown,
  ) {
    super(`Account purge failed during ${stage}`, { cause });
    this.name = 'AccountPurgeError';
  }
}

export interface AccountPurgeSteps {
  cancelBilling: () => Promise<void>;
  deleteDatabaseData: () => Promise<void>;
  deleteStoredFiles: () => Promise<void>;
  revokeAccess: () => Promise<void>;
}

/**
 * Keep authentication intact until every external cleanup has succeeded.
 * Every step before access revocation is idempotent, so a failed deletion can
 * safely be retried by the same signed-in customer.
 */
export async function runAccountPurge(steps: AccountPurgeSteps): Promise<void> {
  const run = async (stage: AccountPurgeStage, action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      throw new AccountPurgeError(stage, error);
    }
  };

  await run('billing', steps.cancelBilling);
  await run('database', steps.deleteDatabaseData);
  await run('files', steps.deleteStoredFiles);
  await run('access', steps.revokeAccess);
}
