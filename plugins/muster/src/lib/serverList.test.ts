import { MCPServer } from './k8s';
import { serverListEntries, serverListRows } from './serverList';
import { toolMatchesQuery } from './toolSearch';

function makeServer(
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
        ...(displayName
          ? { annotations: { 'ui.giantswarm.io/display-name': displayName } }
          : {}),
      },
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

describe('serverListEntries with display names', () => {
  const rows = serverListRows(
    [
      makeServer('mcp-zendesk', undefined, 'Acme Support'),
      makeServer('github'),
    ],
    undefined,
  );

  it('carries the display name and sorts by it', () => {
    expect(serverListEntries(rows, '').map(e => [e.id, e.displayName])).toEqual(
      [
        ['mcp-zendesk', 'Acme Support'],
        ['github', 'github'],
        ['muster', 'Muster'],
      ],
    );
  });

  it('sorts by name whatever the case, and digits by their value', () => {
    const named = serverListRows(
      [
        makeServer('connector-10'),
        makeServer('connector-2'),
        makeServer('Zebra'),
        makeServer('apple'),
      ],
      undefined,
    );
    expect(serverListEntries(named, '').map(e => e.id)).toEqual([
      'apple',
      'connector-2',
      'connector-10',
      'muster',
      'Zebra',
    ]);
  });

  it('matches the display name and the name its page uses', () => {
    expect(serverListEntries(rows, 'acme').map(e => e.id)).toEqual([
      'mcp-zendesk',
    ]);
    expect(serverListEntries(rows, 'zendesk').map(e => e.id)).toEqual([
      'mcp-zendesk',
    ]);
  });
});

describe('serverListEntries with tags', () => {
  const tagged = (name: string, tags: string, family?: string) =>
    new MCPServer(
      {
        apiVersion: 'muster.giantswarm.io/v1alpha1',
        kind: 'MCPServer',
        metadata: { name, annotations: { 'ui.giantswarm.io/tags': tags } },
        spec: family ? { family: { name: family, instanceArg: 'mc' } } : {},
      } as never,
      'gazelle',
    );
  const rows = serverListRows(
    [
      tagged('jira', 'ticketing,ops'),
      tagged('walrus-kubernetes', 'clusters', 'kubernetes'),
      tagged('gazelle-kubernetes', 'ops', 'kubernetes'),
      makeServer('github'),
    ],
    undefined,
  );

  it('gives a server its tags, a family its members’ tags and muster agent-platform', () => {
    expect(rows.map(r => [r.id, r.tags])).toEqual([
      ['kubernetes', ['clusters', 'ops']],
      ['github', []],
      ['jira', ['ticketing', 'ops']],
      ['muster', ['agent-platform']],
    ]);
  });

  it('matches a tag as a name match', () => {
    expect(
      serverListEntries(rows, 'ops').map(e => [e.id, e.toolMatches]),
    ).toEqual([
      ['jira', undefined],
      ['kubernetes', undefined],
    ]);
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
