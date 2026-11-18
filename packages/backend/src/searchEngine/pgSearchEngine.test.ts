import { mockServices } from '@backstage/backend-test-utils';
import { isSearchOnPostgres } from './pgSearchEngine';

function config(database: object) {
  return mockServices.rootConfig({ data: { backend: { database } } });
}

describe('isSearchOnPostgres', () => {
  it('is true on Postgres', () => {
    expect(isSearchOnPostgres(config({ client: 'pg' }))).toBe(true);
  });

  it.each(['better-sqlite3', 'sqlite3', 'mysql2', undefined])(
    'is false on every other client, %p',
    client => {
      expect(isSearchOnPostgres(config({ client }))).toBe(false);
    },
  );

  it("follows the search plugin's own client over the base client", () => {
    expect(
      isSearchOnPostgres(
        config({
          client: 'better-sqlite3',
          plugin: { search: { client: 'pg' } },
        }),
      ),
    ).toBe(true);
    expect(
      isSearchOnPostgres(
        config({
          client: 'pg',
          plugin: { search: { client: 'better-sqlite3' } },
        }),
      ),
    ).toBe(false);
  });
});
