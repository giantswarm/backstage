import { RepositoriesApi } from '../apis';

const unused = (tool: string) => async () => {
  throw new Error(`${tool} is not used by this test`);
};

/**
 * The write side of the API -- and the one read a test opts into, the watch
 * that follows a creation -- for tests that exercise the read side only:
 * every one throws when called, so a test that reaches one fails loudly.
 */
export const unusedWrites: Pick<
  RepositoriesApi,
  | 'validateRepository'
  | 'createRepository'
  | 'updateRepository'
  | 'transferRepository'
  | 'setLifecycle'
  | 'alignRepository'
  | 'watchRepository'
> = {
  validateRepository: unused('validate_repository'),
  createRepository: unused('create_repository'),
  updateRepository: unused('update_repository'),
  transferRepository: unused('transfer_repository'),
  setLifecycle: unused('set_lifecycle'),
  alignRepository: unused('align_repository'),
  watchRepository: unused('watch_repository'),
};
