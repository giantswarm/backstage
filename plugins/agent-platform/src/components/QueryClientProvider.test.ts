import { LEGACY_SHARED_PERSISTER_KEY } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
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
      ['cluster', 'gazelle', 'list', 'kagent.dev', 'v1alpha2', 'agents'],
    ],
    [
      'fleet model configs',
      ['cluster', 'gazelle', 'list', 'kagent.dev', 'v1alpha2', 'modelconfigs'],
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
