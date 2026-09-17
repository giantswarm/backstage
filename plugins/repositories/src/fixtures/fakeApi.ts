import { RepositoriesApi } from '../apis';

const unused = (tool: string) => async () => {
  throw new Error(`${tool} is not used by this test`);
};

/**
 * The write side of the API for tests that exercise the read side only:
 * every write throws when called, so a test that reaches one fails loudly.
 */
export const unusedWrites: Pick<
  RepositoriesApi,
  | 'validateRepository'
  | 'createRepository'
  | 'updateRepository'
  | 'transferRepository'
  | 'setLifecycle'
  | 'reconcileRepository'
> = {
  validateRepository: unused('validate_repository'),
  createRepository: unused('create_repository'),
  updateRepository: unused('update_repository'),
  transferRepository: unused('transfer_repository'),
  setLifecycle: unused('set_lifecycle'),
  reconcileRepository: unused('reconcile_repository'),
};
