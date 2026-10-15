import { MCPServer } from './k8s';
import { connectorNames } from './connectorName';

function server(
  name: string,
  family?: string,
  displayName?: string,
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name,
        namespace: 'muster',
        ...(displayName
          ? { annotations: { 'ui.giantswarm.io/display-name': displayName } }
          : {}),
      },
      spec: family ? { family: { name: family } } : {},
    } as never,
    'gazelle',
  );
}

describe('connectorNames', () => {
  it('names a family member by its family, as Customize lists it', () => {
    const names = connectorNames(
      ['agentlab-mcp-kubernetes', 'github', 'unknown'],
      [server('agentlab-mcp-kubernetes', 'kubernetes'), server('github')],
    );
    expect(names.get('agentlab-mcp-kubernetes')).toBe('kubernetes');
    expect(names.get('github')).toBe('github');
    expect(names.get('unknown')).toBe('unknown');
  });

  it('keeps the own names of two members that would read the same', () => {
    const names = connectorNames(
      ['k8s-a', 'k8s-b'],
      [server('k8s-a', 'kubernetes'), server('k8s-b', 'kubernetes')],
    );
    expect([...names.values()]).toEqual(['k8s-a', 'k8s-b']);
  });

  it('names a connector by its display name, a member by its family’s', () => {
    const names = connectorNames(
      ['mcp-github', 'k8s-a', 'unknown'],
      [
        server('mcp-github', undefined, 'GitHub'),
        server('k8s-a', 'kubernetes', 'Kubernetes'),
      ],
    );
    expect(names.get('mcp-github')).toBe('GitHub');
    expect(names.get('k8s-a')).toBe('Kubernetes');
    expect(names.get('unknown')).toBe('unknown');
  });

  it('keeps the own names of two connectors with the same display name', () => {
    const names = connectorNames(
      ['github-a', 'github-b'],
      [
        server('github-a', undefined, 'GitHub'),
        server('github-b', undefined, 'GitHub'),
      ],
    );
    expect([...names.values()]).toEqual(['github-a', 'github-b']);
  });
});
