import {
  mockServices,
  TestDatabaseId,
  TestDatabases,
} from '@backstage/backend-test-utils';
import {
  ContentReadStore,
  DatabaseContentReadStore,
  MemoryContentReadStore,
} from './ContentReadStore';

jest.setTimeout(60_000);

const ALICE = 'user:default/alice';
const BOB = 'user:default/bob';
const KEY = JSON.stringify([
  'giantswarm/meadow-plans',
  'main',
  'plan-a/PRD.md',
]);

describe('ContentReadStore', () => {
  const databases = TestDatabases.create({
    ids: ['POSTGRES_18', 'SQLITE_3'],
  });

  async function databaseStore(databaseId: TestDatabaseId) {
    const knex = await databases.init(databaseId);
    return DatabaseContentReadStore.create(mockServices.database({ knex }));
  }

  const stores: Array<[string, () => Promise<ContentReadStore>]> = [
    ['memory', async () => new MemoryContentReadStore()],
    ...databases
      .eachSupportedId()
      .map(
        ([id]) =>
          [`database ${id}`, () => databaseStore(id)] as [
            string,
            () => Promise<ContentReadStore>,
          ],
      ),
  ];

  describe.each(stores)('%s', (_name, createStore) => {
    let store: ContentReadStore;
    beforeEach(async () => {
      store = await createStore();
    });

    it('answers a read with what was stored and when it was read', async () => {
      await store.publish(ALICE, KEY, { content: '# PRD', readAt: 1_000 });

      expect(await store.get(ALICE, KEY)).toEqual({
        content: '# PRD',
        readAt: 1_000,
      });
      expect(await store.get(ALICE, `${KEY}x`)).toBeUndefined();
    });

    it("never answers one person's read for another", async () => {
      await store.publish(ALICE, KEY, { content: 'alice', readAt: 1 });

      expect(await store.get(BOB, KEY)).toBeUndefined();
    });

    it('replaces a read with a newer one and answers it', async () => {
      await store.publish(ALICE, KEY, { content: 'v1', readAt: 1 });
      const published = await store.publish(ALICE, KEY, {
        content: 'v2',
        readAt: 2,
      });

      expect(published).toEqual({ content: 'v2', readAt: 2 });
      expect(await store.get(ALICE, KEY)).toEqual({ content: 'v2', readAt: 2 });
    });

    it('never replaces a read with an older one, and answers the newer', async () => {
      await store.publish(ALICE, KEY, { content: 'v2', readAt: 2 });
      const published = await store.publish(ALICE, KEY, {
        content: 'v1',
        readAt: 1,
      });

      expect(published).toEqual({ content: 'v2', readAt: 2 });
      expect(await store.get(ALICE, KEY)).toEqual({ content: 'v2', readAt: 2 });
    });

    it('keeps a long key and a large file', async () => {
      const key = JSON.stringify(['o/r', 'main', `${'deep/'.repeat(200)}x.md`]);
      const content = 'ü'.repeat(300_000);
      await store.publish(ALICE, key, { content, readAt: 1 });

      expect((await store.get(ALICE, key))?.content).toBe(content);
    });

    it('prunes the reads made before a time', async () => {
      await store.publish(ALICE, KEY, { content: 'old', readAt: 1_000 });
      await store.publish(BOB, KEY, { content: 'new', readAt: 3_000 });

      expect(await store.prune(2_000)).toBe(1);
      expect(await store.get(ALICE, KEY)).toBeUndefined();
      expect(await store.get(BOB, KEY)).toEqual({
        content: 'new',
        readAt: 3_000,
      });
    });
  });
});
