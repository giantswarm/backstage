import { mockServices, TestDatabases } from '@backstage/backend-test-utils';
import { getMigratedClient } from './database';

jest.setTimeout(60_000);

describe('getMigratedClient', () => {
  const databases = TestDatabases.create({ ids: ['SQLITE_3'] });

  it.each(databases.eachSupportedId())(
    'migrates once per DatabaseService, %p',
    async databaseId => {
      const knex = await databases.init(databaseId);
      const database = mockServices.database({ knex });
      const getClient = jest.spyOn(database, 'getClient');

      const [first, second] = await Promise.all([
        getMigratedClient(database),
        getMigratedClient(database),
      ]);
      await getMigratedClient(database);

      expect(first).toBe(second);
      expect(getClient).toHaveBeenCalledTimes(1);
    },
  );
});
