import {
  LEGACY_SHARED_PERSISTER_KEY,
  PersistedQueryClient,
  createPluginQueryPersister,
  deserializePersistedClient,
  trimPersistedClient,
} from './queryPersister';

type PersistedQuery = PersistedQueryClient['clientState']['queries'][number];

function makeQuery(
  id: string,
  dataUpdatedAt: number,
  payloadChars = 10,
): PersistedQuery {
  const queryKey = ['cluster', id];
  return {
    queryKey,
    queryHash: JSON.stringify(queryKey),
    state: {
      data: 'x'.repeat(payloadChars),
      dataUpdatedAt,
      status: 'success',
    },
  } as unknown as PersistedQuery;
}

function makeClient(queries: PersistedQuery[]): PersistedQueryClient {
  return {
    timestamp: 1_700_000_000_000,
    buster: '',
    clientState: { queries, mutations: [] },
  };
}

function ids(client: PersistedQueryClient): string[] {
  return client.clientState.queries.map(q => String(q.queryKey[1]));
}

class MemoryStorage {
  readonly map = new Map<string, string>();
  /** When set, `setItem` refuses values longer than this, like a full quota. */
  quotaChars?: number;
  writes = 0;

  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.writes += 1;
    if (this.quotaChars !== undefined && value.length > this.quotaChars) {
      throw new DOMException('quota', 'QuotaExceededError');
    }
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

describe('trimPersistedClient', () => {
  const old = makeQuery('old', 1_000, 400);
  const mid = makeQuery('mid', 2_000, 400);
  const recent = makeQuery('recent', 3_000, 400);

  it('leaves a client under budget untouched', () => {
    const client = makeClient([old, mid, recent]);
    const result = trimPersistedClient(client, 10_000_000);
    expect(result.client).toBe(client);
    expect(result.dropped).toBe(0);
    expect(result.serialized).toBe(JSON.stringify(client));
  });

  it('drops the oldest queries first until the serialisation fits', () => {
    const client = makeClient([old, mid, recent]);
    const budget = JSON.stringify(makeClient([mid, recent])).length;

    const result = trimPersistedClient(client, budget);

    expect(ids(result.client)).toEqual(['mid', 'recent']);
    expect(result.dropped).toBe(1);
    expect(result.serialized.length).toBeLessThanOrEqual(budget);
    expect(result.serialized).toBe(JSON.stringify(result.client));
  });

  it('keeps the surviving queries in their original order', () => {
    // Age decides what goes; it does not reorder what stays.
    const client = makeClient([recent, old, mid]);
    const budget = JSON.stringify(makeClient([recent, mid])).length;

    expect(ids(trimPersistedClient(client, budget).client)).toEqual([
      'recent',
      'mid',
    ]);
  });

  it('drops more than the first estimate when that still does not fit', () => {
    // Budget just below two entries: the first pass (excess ≈ one entry) is
    // not enough, a second pass has to go for the next-oldest as well.
    const client = makeClient([old, mid, recent]);
    const budget = JSON.stringify(makeClient([mid, recent])).length - 1;

    const result = trimPersistedClient(client, budget);

    expect(ids(result.client)).toEqual(['recent']);
    expect(result.dropped).toBe(2);
    expect(result.serialized.length).toBeLessThanOrEqual(budget);
  });

  it('empties the query list when no single entry fits', () => {
    const client = makeClient([old, mid, recent]);
    const result = trimPersistedClient(client, 50);
    expect(result.client.clientState.queries).toEqual([]);
    expect(result.dropped).toBe(3);
    expect(JSON.parse(result.serialized)).toEqual(makeClient([]));
  });

  it('does not mutate the client it was given', () => {
    const client = makeClient([old, mid, recent]);
    trimPersistedClient(client, 50);
    expect(ids(client)).toEqual(['old', 'mid', 'recent']);
  });
});

describe('deserializePersistedClient', () => {
  it('returns a client the library discards for anything but an envelope', () => {
    // timestamp 0 makes persistQueryClientRestore remove the key instead of
    // hydrating, without an error per mount.
    for (const raw of [
      'not json',
      '"string"',
      '[]',
      '{"foo":1}',
      '{"timestamp":"x","clientState":{"queries":[]}}',
      '{"timestamp":1,"clientState":{"queries":{}}}',
    ]) {
      expect(deserializePersistedClient(raw).timestamp).toBe(0);
    }
  });

  it('passes a well-formed envelope through', () => {
    const client = makeClient([makeQuery('a', 1)]);
    expect(deserializePersistedClient(JSON.stringify(client))).toEqual(client);
  });

  it('drops individual query entries hydrate() could not take', () => {
    const good = makeQuery('a', 1);
    const raw = JSON.stringify({
      timestamp: 5,
      clientState: {
        queries: [
          good,
          null,
          'x',
          { queryKey: 'not-an-array' },
          { queryKey: [], state: {} },
        ],
      },
    });
    const client = deserializePersistedClient(raw);
    expect(client.timestamp).toBe(5);
    expect(client.buster).toBe('');
    expect(client.clientState.queries).toEqual([good]);
    expect(client.clientState.mutations).toEqual([]);
  });
});

describe('createPluginQueryPersister', () => {
  it('refuses the shared library default key', () => {
    expect(() =>
      createPluginQueryPersister({
        key: LEGACY_SHARED_PERSISTER_KEY,
        storage: new MemoryStorage(),
      }),
    ).toThrow(/shared library default/);
  });

  it('writes under its own key and removes the legacy shared blob', async () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_SHARED_PERSISTER_KEY, '{"huge":true}');
    storage.setItem('unrelated', 'kept');
    const persister = createPluginQueryPersister({
      key: 'test-react-query-cache',
      storage,
      throttleTime: 0,
    });
    expect(storage.getItem(LEGACY_SHARED_PERSISTER_KEY)).toBeNull();
    expect(storage.getItem('unrelated')).toBe('kept');

    const client = makeClient([makeQuery('a', 1)]);
    await persister.persistClient(client);

    expect(JSON.parse(storage.getItem('test-react-query-cache')!)).toEqual(
      client,
    );
    expect(await persister.restoreClient()).toEqual(client);
  });

  it('restores nothing when the key is absent', async () => {
    const persister = createPluginQueryPersister({
      key: 'test-react-query-cache',
      storage: new MemoryStorage(),
    });
    expect(await persister.restoreClient()).toBeUndefined();
  });

  it('persists only what fits the size budget, newest first', async () => {
    const storage = new MemoryStorage();
    const client = makeClient([
      makeQuery('old', 1_000, 400),
      makeQuery('recent', 3_000, 400),
      makeQuery('mid', 2_000, 400),
    ]);
    const persister = createPluginQueryPersister({
      key: 'test-react-query-cache',
      storage,
      throttleTime: 0,
      maxChars: JSON.stringify(
        makeClient([
          client.clientState.queries[1],
          client.clientState.queries[2],
        ]),
      ).length,
    });

    await persister.persistClient(client);

    const stored = JSON.parse(storage.getItem('test-react-query-cache')!);
    expect(ids(stored)).toEqual(['recent', 'mid']);
    // The live client is untouched: only the persisted copy shrank.
    expect(ids(client)).toEqual(['old', 'recent', 'mid']);
  });

  it('retries a quota error with the oldest entries dropped', async () => {
    const storage = new MemoryStorage();
    const queries = Array.from({ length: 8 }, (_, i) =>
      makeQuery(`q${i}`, (i + 1) * 1_000, 300),
    );
    const client = makeClient(queries);
    // Room for roughly three entries; the budget itself would allow all eight.
    storage.quotaChars =
      JSON.stringify(makeClient(queries.slice(5))).length + 20;
    const persister = createPluginQueryPersister({
      key: 'test-react-query-cache',
      storage,
      throttleTime: 0,
    });

    await persister.persistClient(client);

    const stored = JSON.parse(storage.getItem('test-react-query-cache')!);
    const kept = ids(stored);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(queries.length);
    // Whatever survived is the newest tail of the list.
    expect(kept).toEqual(
      ids(makeClient(queries.slice(queries.length - kept.length))),
    );
  });

  it('gives up on a storage that rejects even an empty client', async () => {
    const storage = new MemoryStorage();
    storage.quotaChars = 0;
    const persister = createPluginQueryPersister({
      key: 'test-react-query-cache',
      storage,
      throttleTime: 0,
    });

    await persister.persistClient(makeClient([makeQuery('a', 1)]));

    expect(storage.getItem('test-react-query-cache')).toBeNull();
    // One write per shrink step, then nothing left to drop: no endless loop.
    expect(storage.writes).toBeLessThanOrEqual(3);
  });
});
