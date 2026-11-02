import type { ServerInfo } from './toolset';
import { connectorLogoSources, connectorMarks } from './connectorMarks';

function server(overrides: Partial<ServerInfo> & { name: string }): ServerInfo {
  return {
    toolNamePrefix: `x_${overrides.name}`,
    state: 'connected',
    oauth: false,
    signInTool: false,
    ...overrides,
  } as ServerInfo;
}

describe('connectorLogoSources', () => {
  it("takes a family's first icon, else its first URL", () => {
    const sources = connectorLogoSources([
      server({ name: 'gh-a', family: 'github', url: 'https://a' }),
      server({ name: 'gh-b', family: 'github', icon: 'data:b' }),
      server({ name: 'slack', url: 'https://slack' }),
    ]);
    expect(sources.get('github')).toEqual({
      icon: 'data:b',
      url: 'https://a',
    });
    expect(sources.get('slack')).toEqual({ url: 'https://slack' });
  });
});

describe('connectorMarks', () => {
  const sources = new Map([['jira', { url: 'https://jira' }]]);
  const labels = new Map([['jira', 'Jira']]);

  it("names a composed toolset's connectors, then the direct servers", () => {
    expect(
      connectorMarks({
        toolset: {
          state: 'declared',
          carrier: 'c',
          selectors: ['server:jira'],
        },
        sources,
        labels,
        direct: [{ name: 'weather', url: 'https://weather', detail: 'All' }],
      }),
    ).toEqual([
      { key: 'server:jira', name: 'Jira', url: 'https://jira' },
      {
        key: 'weather#0',
        name: 'weather',
        icon: undefined,
        url: 'https://weather',
        detail: 'All',
      },
    ]);
  });

  it('names none for full or implicit access', () => {
    for (const toolset of [
      { state: 'implicit-full' as const, carrier: 'c' },
      {
        state: 'declared' as const,
        carrier: 'c',
        selectors: ['preset:full'],
      },
    ]) {
      expect(connectorMarks({ toolset, sources, labels })).toEqual([]);
    }
  });
});
