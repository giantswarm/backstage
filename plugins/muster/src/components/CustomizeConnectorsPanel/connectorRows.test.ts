import { MCPServer, MCPServerState } from '../../lib/k8s';
import type { ServerListEntry } from '../../lib/serverList';
import { connectorReach, connectorStatus, toolsLabel } from './connectorRows';

function server(
  name: string,
  state: MCPServerState = 'Connected',
  suspended = false,
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name },
      spec: { type: 'streamable-http', url: 'https://x.test', suspended },
      status: { state },
    } as never,
    'gazelle',
  );
}

function single(s: MCPServer, toolCount?: number): ServerListEntry {
  return {
    key: `server:${s.getName()}`,
    id: s.getName(),
    row: { kind: 'server', server: s },
    shadowed: false,
    toolCount,
  };
}

describe('connectorStatus', () => {
  it('puts this person’s sign-in before the server’s state', () => {
    const entry = single(server('github', 'Auth Required'));
    expect(
      connectorStatus(entry, { name: 'github', status: 'reauth_required' }),
    ).toEqual({ label: 'Sign-in expired', tone: 'warning' });
    expect(
      connectorStatus(entry, { name: 'github', status: 'auth_required' }),
    ).toEqual({ label: 'Sign in needed', tone: 'warning' });
    expect(connectorStatus(entry)).toEqual({
      label: 'Connected',
      tone: 'success',
    });
  });

  it('names a failing or deactivated server', () => {
    expect(connectorStatus(single(server('a', 'Failed')))).toEqual({
      label: 'Failed',
      tone: 'danger',
    });
    expect(connectorStatus(single(server('a', 'Failed', true)))).toEqual({
      label: 'Deactivated',
      tone: 'neutral',
    });
  });

  it('says how many of a family’s instances are connected', () => {
    const entry: ServerListEntry = {
      key: 'family:kubernetes',
      id: 'kubernetes',
      row: {
        kind: 'family',
        family: 'kubernetes',
        servers: [server('a'), server('b', 'Failed')],
      } as never,
      shadowed: false,
    };
    expect(connectorStatus(entry)).toEqual({
      label: '1 of 2 connected',
      tone: 'danger',
    });
  });
});

describe('toolsLabel', () => {
  it('counts the tools, or the matches of a search', () => {
    expect(toolsLabel(single(server('a')))).toBeUndefined();
    expect(toolsLabel(single(server('a'), 1))).toBe('1 tool');
    expect(toolsLabel({ ...single(server('a'), 5), toolMatches: 2 })).toBe(
      '2 of 5 tools match',
    );
  });
});

describe('connectorReach', () => {
  const family = (...servers: MCPServer[]): ServerListEntry => ({
    key: 'family:kubernetes',
    id: 'kubernetes',
    row: { kind: 'family', family: 'kubernetes', servers } as never,
    shadowed: false,
  });

  it('folds a server’s state and this person’s sign-in into a bucket', () => {
    expect(connectorReach(single(server('a')))).toBe('connected');
    expect(connectorReach(single(server('a', 'Failed')))).toBe('not-connected');
    expect(connectorReach(single(server('a', 'Failed', true)))).toBe(
      'deactivated',
    );
    expect(
      connectorReach(single(server('a')), {
        name: 'a',
        status: 'auth_required',
      }),
    ).toBe('sign-in');
    expect(
      connectorReach(single(server('a')), {
        name: 'a',
        status: 'reauth_required',
      }),
    ).toBe('sign-in');
  });

  it('says whether all, some or none of a family answer', () => {
    expect(connectorReach(family(server('a'), server('b')))).toBe('connected');
    expect(connectorReach(family(server('a'), server('b', 'Failed')))).toBe(
      'partial',
    );
    expect(
      connectorReach(family(server('a', 'Failed'), server('b', 'Failed'))),
    ).toBe('not-connected');
  });
});
