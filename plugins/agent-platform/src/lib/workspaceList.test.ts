import {
  searchWorkspaces,
  sourceLabel,
  storedLabel,
  SYNC_FOLLOW_MS,
  SYNC_REFETCH_MS,
  SYNC_REFETCH_SLOW_MS,
  syncEnded,
  syncRefetchInterval,
  syncState,
  workspacesRefetchInterval,
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
    [{ provider: 'github', owner: 'o' }, 'o · all repositories'],
    [{ provider: 'github', owner: 'o', repositories: ['a', 'b'] }, 'o · a, b'],
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
      'o · lang Go · topic mcp + auth · excl. sandbox',
    ],
  ])('%j reads %s', (source, label) => {
    expect(sourceLabel(source)).toBe(label);
  });
});

describe('syncState', () => {
  // A day after `base` was created.
  const now = Date.parse('2026-10-02T00:00:00Z');

  it.each<[Partial<Workspace>, string]>([
    [{}, 'Not synchronized yet'],
    [{ lastSync: { time: 't', result: 'Succeeded' } }, 'Synchronized'],
    [{ lastSync: { time: 't', result: 'NoChange' } }, 'Unchanged'],
    [{ lastSync: { time: 't', result: 'Failed', message: 'm' } }, 'Failed'],
    [
      {
        lastSync: { time: 't', result: 'Failed' },
        syncRequest: { requestedAt: 'u' },
      },
      'Synchronizing',
    ],
    [{ activeSync: { job: 'j', startedAt: 'u' } }, 'Synchronizing'],
    [{ deleting: true, activeSync: { job: 'j', startedAt: 'u' } }, 'Deleting'],
  ])('%j is %s', (overrides, label) => {
    expect(syncState({ ...base, ...overrides }, undefined, now).label).toBe(
      label,
    );
  });

  it("carries a failure's message", () => {
    expect(
      syncState(
        {
          ...base,
          lastSync: { time: 't', result: 'Failed', message: 'owner gone' },
        },
        undefined,
        now,
      ),
    ).toMatchObject({
      tone: 'danger',
      syncing: false,
      detail: 'owner gone',
      when: { verb: 'Failed', at: 't' },
    });
  });

  it('is synchronizing for a new workspace the manager has not taken up yet', () => {
    const created = { ...base, createdAt: '2026-10-02T00:00:00Z' };
    expect(syncState(created, undefined, now + 10_000)).toMatchObject({
      label: 'Synchronizing',
      syncing: true,
      when: { verb: 'Created', at: '2026-10-02T00:00:00.000Z' },
    });
    // Not forever: past the follow window it says what the read says.
    expect(syncState(created, undefined, now + SYNC_FOLLOW_MS)).toMatchObject({
      label: 'Not synchronized yet',
      syncing: false,
    });
  });

  it('is synchronizing after the person started a sync, until a read shows it ended', () => {
    const last = { time: '2026-10-01T12:00:00Z', result: 'Succeeded' as const };
    const awaited = { after: last.time, since: now };
    // The read after the request does not show it yet.
    expect(
      syncState({ ...base, lastSync: last }, awaited, now + 1000),
    ).toMatchObject({ label: 'Synchronizing', syncing: true });
    // A later read shows another last sync, and nothing running.
    expect(
      syncState(
        {
          ...base,
          lastSync: { time: '2026-10-02T00:01:00Z', result: 'Succeeded' },
        },
        awaited,
        now + 60_000,
      ),
    ).toMatchObject({ label: 'Synchronized', syncing: false });
    // Not forever.
    expect(
      syncState({ ...base, lastSync: last }, awaited, now + SYNC_FOLLOW_MS),
    ).toMatchObject({ label: 'Synchronized', syncing: false });
  });
});

describe('syncEnded', () => {
  const after = '2026-10-01T12:00:00Z';

  it('waits while a sync runs or is requested, or the last sync is the one before', () => {
    const later = {
      time: '2026-10-01T12:05:00Z',
      result: 'Succeeded' as const,
    };
    expect(
      syncEnded(
        { ...base, lastSync: later, syncRequest: { requestedAt: after } },
        after,
      ),
    ).toBe(false);
    expect(
      syncEnded(
        {
          ...base,
          lastSync: later,
          activeSync: { job: 'j', startedAt: after },
        },
        after,
      ),
    ).toBe(false);
    expect(
      syncEnded({ ...base, lastSync: { ...later, time: after } }, after),
    ).toBe(false);
    expect(syncEnded(base, '')).toBe(false);
  });

  it('ends with another last sync, failed or not', () => {
    expect(
      syncEnded(
        {
          ...base,
          lastSync: { time: '2026-10-01T12:05:00Z', result: 'Failed' },
        },
        after,
      ),
    ).toBe(true);
    expect(
      syncEnded(
        {
          ...base,
          lastSync: { time: '2026-10-01T12:05:00Z', result: 'NoChange' },
        },
        '',
      ),
    ).toBe(true);
  });
});

describe('syncRefetchInterval', () => {
  const startedAt = '2026-10-02T00:00:00Z';
  const start = Date.parse(startedAt);
  const running = { ...base, activeSync: { job: 'j', startedAt } };

  it('reads often at first, then less often, then stops', () => {
    expect(syncRefetchInterval(running, undefined, start + 1000)).toBe(
      SYNC_REFETCH_MS,
    );
    expect(syncRefetchInterval(running, undefined, start + 5 * 60_000)).toBe(
      SYNC_REFETCH_SLOW_MS,
    );
    expect(
      syncRefetchInterval(running, undefined, start + SYNC_FOLLOW_MS),
    ).toBe(false);
  });

  it('does not read again while nothing syncs, a deletion included', () => {
    const settled = {
      ...base,
      lastSync: { time: startedAt, result: 'Succeeded' as const },
    };
    expect(syncRefetchInterval(settled, undefined, start)).toBe(false);
    expect(
      syncRefetchInterval({ ...running, deleting: true }, undefined, start),
    ).toBe(false);
  });

  it('follows a new workspace and a sync the person started', () => {
    expect(
      syncRefetchInterval({ ...base, createdAt: startedAt }, undefined, start),
    ).toBe(SYNC_REFETCH_MS);
    expect(
      syncRefetchInterval(
        { ...base, lastSync: { time: 'x', result: 'Succeeded' } },
        { after: 'x', since: start },
        start,
      ),
    ).toBe(SYNC_REFETCH_MS);
  });
});

describe('workspacesRefetchInterval', () => {
  const now = Date.parse('2026-10-02T00:00:00Z');
  const settled = {
    ...base,
    lastSync: { time: 't', result: 'Succeeded' as const },
  };

  it('reads a list again as soon as its soonest workspace needs it', () => {
    expect(
      workspacesRefetchInterval(
        [
          { ...settled, deleting: true },
          {
            ...settled,
            name: 'new',
            activeSync: { job: 'j', startedAt: '2026-10-02T00:00:00Z' },
          },
        ],
        () => undefined,
        now,
      ),
    ).toBe(SYNC_REFETCH_MS);
  });

  it('reads a list with a deletion slowly, and a settled list not at all', () => {
    expect(
      workspacesRefetchInterval(
        [{ ...settled, deleting: true }],
        () => undefined,
        now,
      ),
    ).toBe(SYNC_REFETCH_SLOW_MS);
    expect(workspacesRefetchInterval([settled], () => undefined, now)).toBe(
      false,
    );
    expect(
      workspacesRefetchInterval(
        [settled],
        () => ({ after: 't', since: now }),
        now,
      ),
    ).toBe(SYNC_REFETCH_MS);
  });
});

describe('storedLabel', () => {
  it('adds the share where its class provisions one, and ↑ when the last sync grew it', () => {
    expect(storedLabel(1024, '8Gi')).toMatch(/ of 8 GiB$/);
    expect(storedLabel(1024)).not.toMatch(/ of /);
    expect(storedLabel(1024, '16Gi', '8Gi')).toMatch(/ of 16 GiB ↑$/);
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
