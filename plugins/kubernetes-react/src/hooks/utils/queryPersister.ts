import type { DehydratedState } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

/**
 * The library default key. Until the plugins got keys of their own, the gs, flux
 * and agent-platform QueryClientProviders all persisted under this one, so each
 * client rehydrated the others' entries on restore and wrote them back on its
 * next save: the caches accumulated into a single blob (4.9 MB measured on the
 * Dev Portal, against a per-origin localStorage budget of roughly 5 MB), and
 * one quota error would have silently ended persistence for all of them.
 *
 * Nothing reads it any more. {@link createPluginQueryPersister} removes it so
 * the dead blob stops counting against the quota the new keys need.
 */
export const LEGACY_SHARED_PERSISTER_KEY = 'REACT_QUERY_OFFLINE_CACHE';

/**
 * Default ceiling for one plugin's serialised cache, in UTF-16 code units (what
 * `JSON.stringify(...).length` measures and what browsers charge localStorage
 * against). Well under the ~5 MB origin budget even with three plugins at their
 * ceiling, and far above what a reload needs to be cheap: on the Dev Portal the
 * agent-platform client held ~130 KB and the gs inventory ~11 KB.
 */
export const DEFAULT_PERSISTED_CACHE_MAX_CHARS = 2 * 1024 * 1024;

/** How often a quota error is retried with a smaller client before giving up. */
const MAX_RETRIES_ON_STORAGE_ERROR = 4;

/**
 * What `PersistQueryClientProvider` writes: structurally the persist-client
 * core's `PersistedClient`, spelled out here so this library only depends on
 * `@tanstack/react-query` types.
 */
export interface PersistedQueryClient {
  timestamp: number;
  buster: string;
  clientState: DehydratedState;
}

type PersistedQuery = DehydratedState['queries'][number];

export interface PluginQueryPersisterOptions {
  /**
   * The localStorage key. One per plugin, and never the library default: two
   * providers on one key merge their caches (see {@link LEGACY_SHARED_PERSISTER_KEY}).
   */
  key: string;
  /** Defaults to `window.localStorage`. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /** Passed through to the async storage persister (library default 1 s). */
  throttleTime?: number;
  /** Size guard, see {@link trimPersistedClient}. */
  maxChars?: number;
}

export interface TrimResult {
  /** The client that fits, `queries` sorted as they came in. */
  client: PersistedQueryClient;
  /** `JSON.stringify(client)` — the caller needs it anyway, so it is not redone. */
  serialized: string;
  /** How many queries were dropped, oldest `dataUpdatedAt` first. */
  dropped: number;
}

function dataUpdatedAt(query: PersistedQuery): number {
  return query.state?.dataUpdatedAt ?? 0;
}

function withQueries(
  client: PersistedQueryClient,
  queries: PersistedQuery[],
): PersistedQueryClient {
  return { ...client, clientState: { ...client.clientState, queries } };
}

/**
 * Keeps a persisted client under `maxChars` once serialised by dropping its
 * oldest queries (by `dataUpdatedAt`) first.
 *
 * Oldest-first, not largest-first: the point of persisting is that a *reload*
 * shows the last-known state instantly, and what a person looked at last is
 * what they will look at again. A large but recent fleet list is exactly the
 * entry worth keeping; a small list from a page left six hours ago is not.
 *
 * Only the persisted copy shrinks. The live QueryClient keeps every entry.
 *
 * Cheap on the common path: one `JSON.stringify` (the write needs it anyway) and
 * a length check. Only a client over budget pays for per-query sizes, and then
 * for one more full serialisation to confirm — repeated only if the per-query
 * estimate (each entry plus its separating comma) came out short.
 */
export function trimPersistedClient(
  client: PersistedQueryClient,
  maxChars: number = DEFAULT_PERSISTED_CACHE_MAX_CHARS,
): TrimResult {
  const serialized = JSON.stringify(client);
  if (serialized.length <= maxChars) {
    return { client, serialized, dropped: 0 };
  }

  const queries = client.clientState.queries;
  const sizes = new Map(
    queries.map(query => [query, JSON.stringify(query).length + 1] as const),
  );
  const oldestFirst = [...queries].sort(
    (a, b) => dataUpdatedAt(a) - dataUpdatedAt(b),
  );

  let dropCount = 0;
  let kept = queries;
  let output = serialized;
  while (output.length > maxChars && kept.length > 0) {
    let excess = output.length - maxChars;
    while (excess > 0 && dropCount < oldestFirst.length) {
      excess -= sizes.get(oldestFirst[dropCount]) ?? 0;
      dropCount += 1;
    }
    const dropped = new Set(oldestFirst.slice(0, dropCount));
    kept = queries.filter(query => !dropped.has(query));
    output = JSON.stringify(withQueries(client, kept));
  }

  return {
    client: withQueries(client, kept),
    serialized: output,
    dropped: queries.length - kept.length,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The shape `hydrate()` dereferences without checking. An entry missing any of
 * it would throw inside restore and discard the whole blob, so it is dropped
 * on its own instead.
 */
function isHydratableQuery(value: unknown): value is PersistedQuery {
  return (
    isRecord(value) &&
    Array.isArray(value.queryKey) &&
    typeof value.queryHash === 'string' &&
    isRecord(value.state)
  );
}

/**
 * A client `PersistQueryClientProvider` treats as "nothing persisted": a falsy
 * `timestamp` makes `persistQueryClientRestore` remove the key rather than
 * hydrate from it.
 */
const EMPTY_EXPIRED_CLIENT: PersistedQueryClient = {
  timestamp: 0,
  buster: '',
  clientState: { queries: [], mutations: [] },
};

/**
 * Parses a stored blob defensively. Anything that is not a persisted-client
 * envelope — a different plugin's format under a reused key, a truncated write,
 * a hand-edited value — reads as nothing persisted, and malformed query entries
 * are dropped individually. Throwing here would be caught by the library, but
 * only after an error log per mount.
 *
 * What this cannot catch is a *well-formed* entry whose data shape an older
 * release wrote differently under a key this release still uses. That stays
 * the rule from backstage#2264: a new data shape gets a new query key, and
 * consumers guard what they iterate.
 */
export function deserializePersistedClient(raw: string): PersistedQueryClient {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_EXPIRED_CLIENT;
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.timestamp !== 'number' ||
    !isRecord(parsed.clientState)
  ) {
    return EMPTY_EXPIRED_CLIENT;
  }
  const { queries, mutations } = parsed.clientState;
  if (!Array.isArray(queries)) {
    return EMPTY_EXPIRED_CLIENT;
  }
  return {
    timestamp: parsed.timestamp,
    buster: typeof parsed.buster === 'string' ? parsed.buster : '',
    clientState: {
      queries: queries.filter(isHydratableQuery),
      mutations: Array.isArray(mutations)
        ? (mutations as DehydratedState['mutations'])
        : [],
    },
  };
}

/**
 * The persister every plugin `QueryClientProvider` that wraps
 * `PersistQueryClientProvider` should use.
 *
 * - **Its own key**, so plugins stop merging caches (see
 *   {@link LEGACY_SHARED_PERSISTER_KEY}); the legacy shared blob is removed on
 *   creation because it otherwise keeps its ~5 MB of the origin's quota.
 * - **A size guard** on every write: over `maxChars`, the oldest queries are
 *   left out of the persisted copy ({@link trimPersistedClient}).
 * - **Quota errors** are retried with the client halved (oldest first) a few
 *   times before the write is abandoned — the in-memory cache is unaffected.
 * - **Restore tolerates garbage** ({@link deserializePersistedClient}).
 */
export function createPluginQueryPersister({
  key,
  storage = window.localStorage,
  throttleTime,
  maxChars = DEFAULT_PERSISTED_CACHE_MAX_CHARS,
}: PluginQueryPersisterOptions) {
  if (key === LEGACY_SHARED_PERSISTER_KEY) {
    throw new Error(
      `createPluginQueryPersister: "${key}" is the shared library default; pick a key of the plugin's own`,
    );
  }
  try {
    storage.removeItem(LEGACY_SHARED_PERSISTER_KEY);
  } catch {
    // Storage may be unavailable (privacy mode); persistence simply won't work.
  }

  return createAsyncStoragePersister({
    storage,
    key,
    throttleTime,
    serialize: (client: PersistedQueryClient) =>
      trimPersistedClient(client, maxChars).serialized,
    deserialize: deserializePersistedClient,
    retry: ({ persistedClient, errorCount }) => {
      if (errorCount > MAX_RETRIES_ON_STORAGE_ERROR) {
        return undefined;
      }
      const current = JSON.stringify(persistedClient).length;
      const trimmed = trimPersistedClient(
        persistedClient,
        Math.floor(current / 2),
      );
      return trimmed.dropped > 0 ? trimmed.client : undefined;
    },
  });
}
