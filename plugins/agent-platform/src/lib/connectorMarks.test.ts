import { connectorMarks } from './connectorMarks';

describe('connectorMarks', () => {
  const icons = new Map([['jira', 'data:image/png;base64,AA==']]);
  const labels = new Map([['jira', 'Jira']]);

  it("names a composed toolset's connectors, then the direct servers", () => {
    expect(
      connectorMarks({
        toolset: {
          state: 'declared',
          carrier: 'c',
          selectors: ['server:jira'],
        },
        icons,
        labels,
        direct: [{ key: 'weather#0', name: 'Weather', detail: 'All' }],
      }),
    ).toEqual([
      { key: 'server:jira', name: 'Jira', icon: 'data:image/png;base64,AA==' },
      { key: 'weather#0', name: 'Weather', detail: 'All' },
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
      expect(connectorMarks({ toolset, icons, labels })).toEqual([]);
    }
  });
});
