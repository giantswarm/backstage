import { QueryClient } from '@tanstack/react-query';
import { persistQueryClientRestore } from '@tanstack/react-query-persist-client';
import {
  createPluginQueryPersister,
  LEGACY_SHARED_PERSISTER_KEY,
  type PersistedQueryClient,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  AGENT_PLATFORM_CACHE_BUSTER,
  AGENT_PLATFORM_PERSISTER_KEY,
  shouldDehydrateAgentPlatformQuery,
} from './QueryClientProvider';

describe('AGENT_PLATFORM_PERSISTER_KEY', () => {
  it("is this plugin's own localStorage key, not the shared library default", () => {
    // Sharing the default key with the gs and flux providers merged the three
    // caches into one blob that grew towards the origin's quota.
    expect(AGENT_PLATFORM_PERSISTER_KEY).toBe(
      'agent-platform-react-query-cache',
    );
    expect(AGENT_PLATFORM_PERSISTER_KEY).not.toBe(LEGACY_SHARED_PERSISTER_KEY);
  });
});

describe('shouldDehydrateAgentPlatformQuery', () => {
  it.each([
    ['sessions', ['agent-platform', 'kagent', 'sessions', 'gazelle']],
    ['identity', ['agent-platform', 'kagent', 'me', 'gazelle']],
    [
      // `sessionUsageQueryKey()`: what one person ran, which agents they spent
      // on and which tools they reached for — a behavioural profile, and small
      // enough that nothing but this rule keeps it off the disk.
      'the usage summary',
      ['agent-platform', 'kagent', 'session-usage', 'gazelle'],
    ],
    [
      // `musterToolsetResolutionQueryKey`: toolset ∩ the caller's own session
      // catalogue, read for the Tools step and the agent page.
      'toolset resolutions',
      [
        'muster',
        'agent-platform',
        'toolset-resolution',
        'gazelle',
        'preset:read-only',
      ],
    ],
    [
      'the per-session tool catalogue',
      ['muster', 'agent-platform', 'tool-catalogue', 'gazelle'],
    ],
    [
      // The muster plugin's `useServerSignIn` keys, when its hook renders
      // inline under this client.
      "the muster plugin's per-session auth status",
      ['muster', 'auth-status', 'gazelle'],
    ],
  ])('never persists user-scoped %s data', (_label, queryKey) => {
    // These hold one user's chat titles and their email. Persisting them would
    // leave them on disk after sign-out and let PersistQueryClientProvider
    // rehydrate them for the next user on a shared workstation.
    expect(shouldDehydrateAgentPlatformQuery(queryKey)).toBe(false);
  });

  it.each([
    [
      // `kagentInstallationsQueryKey()`: the backend's list with per-installation
      // reachability. The 'v2' segment is what keeps a rehydrated names-only
      // entry from the previous key from ever being read as this shape.
      'the kagent installation list with reachability',
      ['agent-platform', 'kagent', 'installations', 'v2'],
    ],
    [
      'fleet agents',
      ['cluster', 'gazelle', 'list', 'kagent.dev', 'v1alpha3', 'agenttemplates'],
    ],
    [
      'fleet toolset carriers',
      [
        'cluster',
        'gazelle',
        'list',
        'kagent.dev',
        'v1alpha3',
        'remotemcpservers',
      ],
    ],
    [
      'fleet model configs',
      ['cluster', 'gazelle', 'list', 'kagent.dev', 'v1alpha3', 'modelconfigs'],
    ],
    [
      // The gs hook's key (`installationInventoryQueryKey`): which platform
      // components an installation runs, one GET /apis per installation. Fleet
      // state, and the reason a reload does not re-probe the whole fleet.
      'the installation inventory',
      ['gs', 'installation-inventory', 'v1', 'gazelle'],
    ],
  ])('still persists installation-wide %s', (_label, queryKey) => {
    // Identical for every user, so caching across reloads is the whole point.
    expect(shouldDehydrateAgentPlatformQuery(queryKey)).toBe(true);
  });

  it('does not over-match a similarly shaped key from elsewhere', () => {
    expect(
      shouldDehydrateAgentPlatformQuery(['other-plugin', 'kagent', 'sessions']),
    ).toBe(true);
    expect(
      shouldDehydrateAgentPlatformQuery([
        'agent-platform',
        'other',
        'sessions',
      ]),
    ).toBe(true);
  });

  it('tolerates short and empty keys', () => {
    expect(shouldDehydrateAgentPlatformQuery([])).toBe(true);
    expect(shouldDehydrateAgentPlatformQuery(['agent-platform'])).toBe(true);
  });
});

describe('AGENT_PLATFORM_CACHE_BUSTER', () => {
  class MemoryStorage {
    readonly map = new Map<string, string>();
    getItem(key: string) {
      return this.map.get(key) ?? null;
    }
    setItem(key: string, value: string) {
      this.map.set(key, value);
    }
    removeItem(key: string) {
      this.map.delete(key);
    }
  }

  /** A blob a previous release wrote: one fleet list of kagent 0.10 Agents. */
  function previousReleaseBlob(buster: string): PersistedQueryClient {
    const queryKey = [
      'cluster',
      'gazelle',
      'list',
      'kagent.dev',
      'v1alpha2',
      'agents',
    ];
    return {
      timestamp: Date.now(),
      buster,
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey,
            queryHash: JSON.stringify(queryKey),
            state: {
              data: [{ kind: 'Agent', metadata: { name: 'stale' } }],
              dataUpdatedAt: Date.now(),
              dataUpdateCount: 1,
              error: null,
              errorUpdatedAt: 0,
              errorUpdateCount: 0,
              fetchFailureCount: 0,
              fetchFailureReason: null,
              fetchMeta: null,
              isInvalidated: false,
              status: 'success',
              fetchStatus: 'idle',
            },
          },
        ],
      },
    } as PersistedQueryClient;
  }

  async function restore(storedBuster: string) {
    const storage = new MemoryStorage();
    storage.setItem(
      AGENT_PLATFORM_PERSISTER_KEY,
      JSON.stringify(previousReleaseBlob(storedBuster)),
    );
    const queryClient = new QueryClient();
    await persistQueryClientRestore({
      queryClient,
      persister: createPluginQueryPersister({
        key: AGENT_PLATFORM_PERSISTER_KEY,
        storage,
      }),
      buster: AGENT_PLATFORM_CACHE_BUSTER,
      maxAge: 1000 * 60 * 60,
    });
    return { queryClient, storage };
  }

  it('names the API version the readers expect', () => {
    expect(AGENT_PLATFORM_CACHE_BUSTER).toBe('kagent.dev/v1alpha3');
  });

  // The upgrade case: a browser holding the previous release's blob. Its rows
  // are kagent 0.10 Agents; none of them may reach the v1alpha3 readers, and
  // the blob must not be kept and rewritten for the rest of its maxAge.
  it('discards a blob a portal on another API version wrote', async () => {
    const { queryClient, storage } = await restore('');

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(storage.getItem(AGENT_PLATFORM_PERSISTER_KEY)).toBeNull();
  });

  it('restores a blob written under the current version', async () => {
    const { queryClient } = await restore(AGENT_PLATFORM_CACHE_BUSTER);

    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
  });
});
