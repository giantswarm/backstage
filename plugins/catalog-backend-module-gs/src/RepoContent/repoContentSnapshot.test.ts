import { mockServices } from '@backstage/backend-test-utils';
import { RepoContentSnapshot } from './repoContentSnapshot';
import type { RepoContent, RepoContentStore } from './repoContentStore';

const main: RepoContent = { defaultBranch: 'main', hasReadme: true };

function storeWith(getAll: jest.Mock) {
  return { getAll } as unknown as RepoContentStore;
}

describe('RepoContentSnapshot', () => {
  it('reads the table once per TTL, and again after invalidate', async () => {
    const getAll = jest
      .fn()
      .mockResolvedValue(new Map([['giantswarm/alpha', main]]));
    const snapshot = new RepoContentSnapshot(
      storeWith(getAll),
      mockServices.logger.mock(),
      { ttlMs: 60_000 },
    );

    await Promise.all([snapshot.get(), snapshot.get()]);
    expect((await snapshot.get())?.get('giantswarm/alpha')).toEqual(main);
    expect(getAll).toHaveBeenCalledTimes(1);

    snapshot.invalidate();
    await snapshot.get();
    expect(getAll).toHaveBeenCalledTimes(2);
  });

  it('serves the last records while the table cannot be read, and warns once', async () => {
    const getAll = jest
      .fn()
      .mockResolvedValueOnce(new Map([['giantswarm/alpha', main]]))
      .mockRejectedValue(new Error('connection refused'));
    const logger = mockServices.logger.mock();
    const snapshot = new RepoContentSnapshot(storeWith(getAll), logger, {
      ttlMs: 0,
      retryMs: 0,
    });

    await snapshot.get();
    for (let i = 0; i < 3; i++) {
      expect((await snapshot.get())?.get('giantswarm/alpha')).toEqual(main);
    }

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('holds off reading again for retryMs after a failure', async () => {
    const getAll = jest.fn().mockRejectedValue(new Error('down'));
    const snapshot = new RepoContentSnapshot(
      storeWith(getAll),
      mockServices.logger.mock(),
      { retryMs: 60_000 },
    );

    expect(await snapshot.get()).toBeUndefined();
    expect(await snapshot.get()).toBeUndefined();
    expect(getAll).toHaveBeenCalledTimes(1);
  });
});
