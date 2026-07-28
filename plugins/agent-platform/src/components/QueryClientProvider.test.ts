import { shouldDehydrateAgentPlatformQuery } from './QueryClientProvider';

describe('shouldDehydrateAgentPlatformQuery', () => {
  it.each([
    ['sessions', ['agent-platform', 'kagent', 'sessions', 'gazelle']],
    ['identity', ['agent-platform', 'kagent', 'me', 'gazelle']],
  ])('never persists user-scoped %s data', (_label, queryKey) => {
    // These hold one user's chat titles and their email. Persisting them would
    // leave them on disk after sign-out and let PersistQueryClientProvider
    // rehydrate them for the next user on a shared workstation.
    expect(shouldDehydrateAgentPlatformQuery(queryKey)).toBe(false);
  });

  it.each([
    [
      'the kagent installation allowlist',
      ['agent-platform', 'kagent', 'installations'],
    ],
    [
      'fleet agents',
      ['cluster', 'gazelle', 'list', 'kagent.dev', 'v1alpha2', 'agents'],
    ],
    [
      'fleet model configs',
      ['cluster', 'gazelle', 'list', 'kagent.dev', 'v1alpha2', 'modelconfigs'],
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
