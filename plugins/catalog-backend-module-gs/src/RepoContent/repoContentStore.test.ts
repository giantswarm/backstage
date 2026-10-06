import {
  mockServices,
  type TestDatabaseId,
  TestDatabases,
} from '@backstage/backend-test-utils';
import { getMigratedClient } from '../util/database';
import { RepoContentStore } from './repoContentStore';

jest.setTimeout(60_000);

describe('RepoContentStore', () => {
  const databases = TestDatabases.create({ ids: ['SQLITE_3'] });

  async function createStore(databaseId: TestDatabaseId) {
    const knex = await databases.init(databaseId);
    return new RepoContentStore(
      await getMigratedClient(mockServices.database({ knex })),
    );
  }

  const main = { defaultBranch: 'main', hasReadme: true };
  const at = new Date('2026-10-06T10:00:00Z');

  it.each(databases.eachSupportedId())(
    'reports a change only when the content differs, %p',
    async databaseId => {
      const store = await createStore(databaseId);

      expect(await store.get('giantswarm/alpha')).toBeUndefined();
      expect(await store.put('giantswarm/alpha', main, at)).toBe(true);
      expect(await store.put('giantswarm/alpha', main, at)).toBe(false);
      expect(
        await store.put(
          'giantswarm/alpha',
          { defaultBranch: 'master', hasReadme: true },
          at,
        ),
      ).toBe(true);
      expect(await store.get('giantswarm/alpha')).toEqual({
        defaultBranch: 'master',
        hasReadme: true,
      });
    },
  );

  it.each(databases.eachSupportedId())(
    'deletes one record, or every record not retained, %p',
    async databaseId => {
      const store = await createStore(databaseId);
      await store.put('giantswarm/alpha', main, at);
      await store.put('giantswarm/beta', main, at);
      await store.put('giantswarm/gamma', main, at);

      expect(await store.delete('giantswarm/alpha')).toBe(true);
      expect(await store.delete('giantswarm/alpha')).toBe(false);
      expect(await store.retainOnly(['giantswarm/beta'])).toBe(1);
      expect(await store.get('giantswarm/beta')).toEqual(main);
      expect(await store.get('giantswarm/gamma')).toBeUndefined();
    },
  );
});
