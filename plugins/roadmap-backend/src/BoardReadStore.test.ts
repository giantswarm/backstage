import {
  mockServices,
  TestDatabaseId,
  TestDatabases,
} from '@backstage/backend-test-utils';
import {
  BoardReadStore,
  DatabaseBoardReadStore,
  MemoryBoardReadStore,
} from './BoardReadStore';

jest.setTimeout(60_000);

const ALICE = 'user:default/alice';
const BOB = 'user:default/bob';

describe('BoardReadStore', () => {
  const databases = TestDatabases.create({
    ids: ['POSTGRES_18', 'SQLITE_3'],
  });

  async function databaseStore(databaseId: TestDatabaseId) {
    const knex = await databases.init(databaseId);
    return DatabaseBoardReadStore.create(mockServices.database({ knex }));
  }

  const stores: Array<[string, () => Promise<BoardReadStore>]> = [
    ['memory', async () => new MemoryBoardReadStore()],
    ...databases
      .eachSupportedId()
      .map(
        ([id]) =>
          [`database ${id}`, () => databaseStore(id)] as [
            string,
            () => Promise<BoardReadStore>,
          ],
      ),
  ];

  describe.each(stores)('%s', (_name, createStore) => {
    let store: BoardReadStore;
    beforeEach(async () => {
      store = await createStore();
    });

    it('answers a read with what was stored and when it was read', async () => {
      await store.set(ALICE, 'items', '{"Team":"A"}', {
        data: { issues: [{ id: 'PVTI_1' }] },
        readAt: 1_000,
      });
      expect(await store.get(ALICE, 'items', '{"Team":"A"}')).toEqual({
        data: { issues: [{ id: 'PVTI_1' }] },
        readAt: 1_000,
      });
      expect(await store.get(ALICE, 'items', '{"Team":"B"}')).toBeUndefined();
    });

    it("never answers one person's read for another", async () => {
      await store.set(ALICE, 'items', 'k', { data: 'alice', readAt: 1 });
      expect(await store.get(BOB, 'items', 'k')).toBeUndefined();
      expect(await store.list(BOB, 'items')).toEqual([]);

      await store.set(BOB, 'items', 'k', { data: 'bob', readAt: 2 });
      expect((await store.get(ALICE, 'items', 'k'))?.data).toBe('alice');
      expect((await store.get(BOB, 'items', 'k'))?.data).toBe('bob');
    });

    it('replaces a read and keeps keys of any length', async () => {
      const key = JSON.stringify({ keyword: 'x'.repeat(5_000) });
      await store.set(ALICE, 'items', key, { data: 1, readAt: 1 });
      await store.set(ALICE, 'items', key, { data: 2, readAt: 2 });
      expect(await store.get(ALICE, 'items', key)).toEqual({
        data: 2,
        readAt: 2,
      });
      expect(await store.list(ALICE, 'items')).toEqual([
        { key, read: { data: 2, readAt: 2 } },
      ]);
    });

    it('drops one read, or every read of a kind of one person', async () => {
      await store.set(ALICE, 'sub-issues', 'a#1', { data: 1, readAt: 1 });
      await store.set(ALICE, 'sub-issues', 'a#2', { data: 2, readAt: 1 });
      await store.set(ALICE, 'item', 'PVTI_1', { data: 3, readAt: 1 });
      await store.set(BOB, 'sub-issues', 'a#1', { data: 4, readAt: 1 });

      await store.delete(ALICE, 'item', 'PVTI_1');
      expect(await store.get(ALICE, 'item', 'PVTI_1')).toBeUndefined();

      await store.delete(ALICE, 'sub-issues');
      expect(await store.list(ALICE, 'sub-issues')).toEqual([]);
      expect(await store.list(BOB, 'sub-issues')).toHaveLength(1);
    });

    it('prunes the reads made before a time', async () => {
      await store.set(ALICE, 'items', 'old', { data: 1, readAt: 1_000 });
      await store.set(ALICE, 'items', 'new', { data: 2, readAt: 3_000 });
      expect(await store.prune(2_000)).toBe(1);
      expect(await store.get(ALICE, 'items', 'old')).toBeUndefined();
      expect(await store.get(ALICE, 'items', 'new')).toBeDefined();
    });

    it('keeps what it answered apart from what it stores', async () => {
      await store.set(ALICE, 'items', 'k', {
        data: { fields: { Status: 'Done' } },
        readAt: 1,
      });
      const read = await store.get<{ fields: Record<string, string> }>(
        ALICE,
        'items',
        'k',
      );
      read!.data.fields.Status = 'Changed';
      expect((await store.get(ALICE, 'items', 'k'))?.data).toEqual({
        fields: { Status: 'Done' },
      });
    });
  });

  it.each(databases.eachSupportedId())(
    'shares reads between two stores on one database, %p',
    async databaseId => {
      const knex = await databases.init(databaseId);
      const first = await DatabaseBoardReadStore.create(
        mockServices.database({ knex }),
      );
      const second = await DatabaseBoardReadStore.create(
        mockServices.database({ knex }),
      );
      await first.set(ALICE, 'items', 'k', { data: 'read once', readAt: 5 });
      expect(await second.get(ALICE, 'items', 'k')).toEqual({
        data: 'read once',
        readAt: 5,
      });
    },
  );
});
