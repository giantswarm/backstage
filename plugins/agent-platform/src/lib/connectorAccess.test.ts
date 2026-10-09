import { connectorAccess } from './connectorAccess';
import type { DeclaredToolset } from './toolset';

const target = {
  serverNames: ['kubernetes', 'agentlab-mcp-kubernetes'],
  ownsTool: (name: string) => name.startsWith('x_kubernetes_'),
  readOnlyToolCount: 12,
};

function declared(...selectors: string[]): DeclaredToolset {
  return { state: 'declared', selectors, carrier: 'agent' };
}

describe('connectorAccess', () => {
  it.each([
    ['preset:full', declared('preset:full')],
    ['a server: selector naming the family', declared('server:kubernetes')],
    [
      'a server: selector naming an instance',
      declared('server:agentlab-mcp-kubernetes', 'tool:x_other_get'),
    ],
    [
      'a gateway binding without a toolset',
      { state: 'implicit-full', carrier: 'agent' } as DeclaredToolset,
    ],
  ])('reads %s as all tools', (_, toolset) => {
    expect(connectorAccess(toolset, target)).toBe('All tools');
  });

  it('counts the tool: selectors naming tools of the connector', () => {
    expect(
      connectorAccess(
        declared(
          'tool:x_kubernetes_get',
          'tool:x_kubernetes_list',
          'tool:x_kubernetes_get',
          'tool:x_prometheus_query',
        ),
        target,
      ),
    ).toBe('2 tools');
    expect(connectorAccess(declared('tool:x_kubernetes_get'), target)).toBe(
      '1 tool',
    );
  });

  it('reads preset:read-only as looking things up, with any tools beside it', () => {
    expect(connectorAccess(declared('preset:read-only'), target)).toBe(
      'Look things up',
    );
    expect(
      connectorAccess(
        declared('preset:read-only', 'tool:x_kubernetes_delete'),
        target,
      ),
    ).toBe('Look things up · 1 tool');
  });

  it('leaves preset:read-only out for a connector without read-only tools', () => {
    expect(
      connectorAccess(declared('preset:read-only'), {
        ...target,
        readOnlyToolCount: 0,
      }),
    ).toBeUndefined();
  });

  it.each([
    ['no toolset read', undefined],
    ['no gateway binding', { state: 'no-gateway' } as DeclaredToolset],
    [
      'an unreadable carrier',
      { state: 'unresolved', carrier: 'agent' } as DeclaredToolset,
    ],
    ['preset:none', declared('preset:none')],
    ['another server', declared('server:prometheus')],
    ['an installation preset', declared('preset:infrastructure')],
  ])('says nothing for %s', (_, toolset) => {
    expect(connectorAccess(toolset, target)).toBeUndefined();
  });
});
