import {
  searchWorkspaces,
  sourceLabel,
  storedLabel,
  syncState,
  type WorkspaceRow,
} from './workspaceList';
import type { Workspace } from './workspaceManager';

const base: Workspace = {
  name: 'docs',
  organization: 'alpha',
  sources: [{ provider: 'github', owner: 'example-org' }],
  sync: { schedule: 'nightly' },
  resourceVersion: '1',
  createdAt: '2026-10-01T00:00:00Z',
  repositories: 0,
  sessions: 0,
};

describe('sourceLabel', () => {
  it.each([
    [{ provider: 'github', owner: 'o' }, 'github: o · all repositories'],
    [
      { provider: 'github', owner: 'o', repositories: ['a', 'b'] },
      'github: o · a, b',
    ],
    [
      {
        provider: 'github',
        owner: 'o',
        filters: {
          languages: ['Go'],
          topics: { match: 'all' as const, names: ['mcp', 'auth'] },
        },
        exclude: ['sandbox'],
      },
      'github: o · lang Go · topic mcp + auth · excl. sandbox',
    ],
  ])('%j reads %s', (source, label) => {
    expect(sourceLabel(source)).toBe(label);
  });
});

describe('syncState', () => {
  it.each<[Partial<Workspace>, string]>([
    [{}, 'Not synced yet'],
    [{ lastSync: { time: 't', result: 'Succeeded' } }, 'Synced'],
    [{ lastSync: { time: 't', result: 'NoChange' } }, 'No change'],
    [{ lastSync: { time: 't', result: 'Failed', message: 'm' } }, 'Failed'],
    [
      {
        lastSync: { time: 't', result: 'Failed' },
        syncRequest: { requestedAt: 'u' },
      },
      'Sync requested',
    ],
    [{ activeSync: { job: 'j', startedAt: 'u' } }, 'Syncing'],
    [{ deleting: true, activeSync: { job: 'j', startedAt: 'u' } }, 'Deleting'],
  ])('%j is %s', (overrides, label) => {
    expect(syncState({ ...base, ...overrides }).label).toBe(label);
  });

  it("carries a failure's message", () => {
    expect(
      syncState({
        ...base,
        lastSync: { time: 't', result: 'Failed', message: 'owner gone' },
      }),
    ).toMatchObject({ tone: 'danger', detail: 'owner gone', at: 't' });
  });
});

describe('storedLabel', () => {
  it('adds the share where its class provisions one, and ↑ when the last sync grew it', () => {
    expect(storedLabel(1024, '8Gi')).toMatch(/ of 8Gi$/);
    expect(storedLabel(1024)).not.toMatch(/ of /);
    expect(storedLabel(1024, '16Gi', '8Gi')).toMatch(/ of 16Gi ↑$/);
  });
});

describe('searchWorkspaces', () => {
  const rows: WorkspaceRow[] = [
    { ...base, installation: 'gazelle', id: 'gazelle/docs' },
    {
      ...base,
      name: 'mcp',
      sources: [{ provider: 'github', owner: 'tools-org' }],
      installation: 'gazelle',
      id: 'gazelle/mcp',
    },
  ];

  it('matches the name and the sources', () => {
    expect(searchWorkspaces(rows, 'DOCS').map(r => r.name)).toEqual(['docs']);
    expect(searchWorkspaces(rows, 'tools-org').map(r => r.name)).toEqual([
      'mcp',
    ]);
    expect(searchWorkspaces(rows, '  ')).toHaveLength(2);
  });
});
