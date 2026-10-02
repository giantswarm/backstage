import { MCPServer } from './k8s';
import { serverListEntries, serverListRows } from './serverList';
import { toolMatchesQuery } from './toolSearch';

function makeServer(name: string, family?: string): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name },
      spec: {
        ...(family ? { family: { name: family, instanceArg: 'mc' } } : {}),
      },
    } as never,
    'gazelle',
  );
}

const tool = (name: string, description?: string) => ({ name, description });

describe('serverListRows', () => {
  it('keys a family and a singular server of the same name apart, and marks the singular one shadowed', () => {
    const rows = serverListRows(
      [
        makeServer('walrus-github', 'github'),
        makeServer('github'),
        makeServer('muster'),
      ],
      [tool('x_github_list_pulls'), tool('core_workflow_list')],
    );

    expect(rows.map(r => [r.key, r.id, r.shadowed, r.tools?.length])).toEqual([
      ['family:github', 'github', false, 1],
      ['server:github', 'github', true, 0],
      ['server:muster', 'muster', true, 0],
      ['core', 'muster', false, 1],
    ]);
  });

  it('leaves the tools unknown without a catalogue', () => {
    expect(serverListRows([makeServer('aws')], undefined)[0].tools).toBe(
      undefined,
    );
  });
});

describe('serverListEntries', () => {
  const rows = serverListRows(
    [makeServer('walrus-mcp-kubernetes', 'kubernetes'), makeServer('github')],
    [
      tool('x_kubernetes_get_pods', 'List pods'),
      tool('x_github_list_pulls', 'List pull requests'),
    ],
  );

  it('finds a tool by its full name, as an agent transcript spells it', () => {
    expect(
      serverListEntries(rows, 'x_kubernetes_get_pods').map(e => [
        e.id,
        e.toolMatches,
      ]),
    ).toEqual([['kubernetes', 1]]);
  });

  it('treats a row its name matches as a name match, not as all its tools matching', () => {
    expect(
      serverListEntries(rows, 'github').map(e => [e.id, e.toolMatches]),
    ).toEqual([['github', undefined]]);
  });
});

describe('toolMatchesQuery', () => {
  it('matches the full name, the short name or the description', () => {
    const t = tool('x_kubernetes_get_pods', 'List pods');
    expect(toolMatchesQuery(t, 'get_pods', 'x_kubernetes_get')).toBe(true);
    expect(toolMatchesQuery(t, 'get_pods', 'GET_PODS')).toBe(true);
    expect(toolMatchesQuery(t, 'get_pods', 'list')).toBe(true);
    expect(toolMatchesQuery(t, 'get_pods', 'logs')).toBe(false);
  });
});
