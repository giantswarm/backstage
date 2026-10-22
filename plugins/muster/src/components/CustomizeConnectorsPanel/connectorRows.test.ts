import { MCPServer, MCPServerState } from '../../lib/k8s';
import type { ServerListEntry } from '../../lib/serverList';
import {
  catalogueState,
  type ConnectorReach,
  connectorReach,
  connectorStatus,
  toolsLabel,
  unsearchedToolsNotes,
} from './connectorRows';

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
    displayName: s.getName(),
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

  it('never asks a sign-in of an SSO server, and says when one refused it', () => {
    const entry = single(server('grafana'));
    const sso = { name: 'grafana', token_forwarding_enabled: true };
    expect(
      connectorStatus(entry, {
        ...sso,
        status: 'reauth_required',
        sso_attempt_failed: true,
      }),
    ).toEqual({ label: 'Cannot connect', tone: 'danger' });
    // Not connected yet: the server's own state.
    expect(connectorStatus(entry, { ...sso, status: 'auth_required' })).toEqual(
      { label: 'Connected', tone: 'success' },
    );
    expect(
      connectorStatus(entry, {
        name: 'grafana',
        kind: 'sso',
        status: 'auth_required',
      }),
    ).toEqual({ label: 'Connected', tone: 'success' });
    // A failure muster kept from another session.
    expect(
      connectorStatus(entry, {
        ...sso,
        status: 'connected',
        sso_attempt_failed: true,
      }),
    ).toEqual({ label: 'Connected', tone: 'success' });
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
      displayName: 'kubernetes',
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
    displayName: 'kubernetes',
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

  it('files an SSO server that refused the sign-in under not connected, never sign-in', () => {
    const sso = { name: 'a', token_exchange_enabled: true };
    expect(
      connectorReach(single(server('a')), {
        ...sso,
        status: 'reauth_required',
        sso_attempt_failed: true,
      }),
    ).toBe('not-connected');
    expect(
      connectorReach(single(server('a')), { ...sso, status: 'auth_required' }),
    ).toBe('connected');
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

describe('catalogueState', () => {
  const state = (over: Partial<Parameters<typeof catalogueState>[0]>) =>
    catalogueState({
      answered: false,
      truncated: false,
      loading: false,
      failed: false,
      ...over,
    });

  it('tells a full, partial, loading, failed and absent catalogue apart', () => {
    expect(state({ answered: true })).toBe('loaded');
    expect(state({ answered: true, truncated: true })).toBe('partial');
    // A refetch that failed keeps the tools it read.
    expect(state({ answered: true, failed: true })).toBe('loaded');
    expect(state({ loading: true })).toBe('loading');
    expect(state({ failed: true })).toBe('failed');
    expect(state({})).toBe('unavailable');
  });
});

describe('unsearchedToolsNotes', () => {
  const row = (name: string, reach: ConnectorReach, toolCount = 0) => ({
    entry: single(server(name), toolCount),
    reach,
  });

  it('says only names were searched while the catalogue is not read', () => {
    expect(
      unsearchedToolsNotes('loading', [row('a', 'sign-in')], true),
    ).toEqual([
      'Only connector names were searched: the tools are still loading.',
    ]);
    expect(unsearchedToolsNotes('unavailable', [], false)).toEqual([
      'Only connector names were searched: tools need a muster session.',
    ]);
  });

  it('leaves a failed catalogue to the list’s alert', () => {
    expect(unsearchedToolsNotes('failed', [row('a', 'sign-in')], true)).toEqual(
      [],
    );
  });

  it('names the connectors that list no tools for want of a sign-in or an answer', () => {
    expect(
      unsearchedToolsNotes(
        'loaded',
        [
          row('github', 'sign-in'),
          row('jira', 'sign-in'),
          row('slack', 'not-connected'),
          // Its tools were listed, so they were searched.
          row('linear', 'sign-in', 4),
          // It has none.
          row('web-search', 'connected'),
          row('old', 'deactivated'),
        ],
        true,
      ),
    ).toEqual([
      'The tools of 2 connectors (github, jira) were not searched: they need your sign-in.',
      'The tools of slack were not searched: they could not be read.',
    ]);
  });

  it('names every connector without tools while sign-ins are unknown', () => {
    expect(
      unsearchedToolsNotes(
        'loaded',
        [row('github', 'connected'), row('old', 'deactivated')],
        false,
      ),
    ).toEqual([
      'The tools of github were not searched: muster listed none of them.',
    ]);
  });

  it('says a cut-off catalogue was not searched in full', () => {
    expect(
      unsearchedToolsNotes('partial', [row('github', 'sign-in')], true),
    ).toEqual([
      'Some tools were not searched: muster returned only part of them.',
      'The tools of github were not searched: they need your sign-in.',
    ]);
  });

  it('names neither muster nor a server its family shadows', () => {
    const shadowed = {
      entry: { ...single(server('github'), 0), shadowed: true },
      reach: 'sign-in' as const,
    };
    const core = {
      entry: {
        key: 'core',
        id: 'muster',
        displayName: 'muster',
        row: { kind: 'core' as const },
        shadowed: false,
        toolCount: 0,
      },
      reach: 'not-connected' as const,
    };
    expect(unsearchedToolsNotes('loaded', [shadowed, core], false)).toEqual([]);
  });

  it('says nothing when every connector’s tools were searched', () => {
    expect(
      unsearchedToolsNotes('loaded', [row('web-search', 'connected', 3)], true),
    ).toEqual([]);
  });
});
