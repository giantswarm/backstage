import {
  searchWorkspaces,
  sourceLabel,
  sourceSummary,
  sourcesSummary,
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

describe('sourceSummary', () => {
  const apps = Array.from({ length: 7 }, (_, i) => `app-${i + 1}`);
  const old = Array.from({ length: 8 }, (_, i) => `old-${i + 1}`);

  it.each([
    [
      { provider: 'github', owner: 'o', repositories: apps, exclude: old },
      'o · 7 repositories',
    ],
    [
      {
        provider: 'github',
        owner: 'o',
        repositories: apps,
        exclude: ['app-1', 'old-1'],
      },
      'o · 6 repositories',
    ],
    [
      { provider: 'github', owner: 'o', repositories: ['a'] },
      'o · 1 repository',
    ],
    [{ provider: 'github', owner: 'o' }, 'o · all repositories'],
    [
      {
        provider: 'github',
        owner: 'o',
        repositories: ['a', 'b'],
        filters: {
          languages: ['Go'],
          topics: { match: 'all' as const, names: ['mcp', 'auth'] },
        },
        exclude: ['b', 'sandbox'],
      },
      'o · lang Go · topic mcp + auth · 1 by name',
    ],
  ])('%j reads %s', (source, label) => {
    expect(sourceSummary(source)).toBe(label);
  });

  it('joins the sources', () => {
    expect(
      sourcesSummary([
        { provider: 'github', owner: 'o', repositories: ['a'] },
        { provider: 'gitlab', owner: 'g', filters: { languages: ['Go'] } },
      ]),
    ).toBe('o · 1 repository; g · lang Go');
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
      reported: false,
      detail: 'owner gone',
      when: { verb: 'Failed', at: 't' },
    });
  });

  it('follows a sync the manager reports for as long as it runs', () => {
    const running = {
      ...base,
      activeSync: { job: 'j', startedAt: '2026-10-02T00:00:00Z' },
    };
    expect(
      syncState(running, undefined, now + 2 * SYNC_FOLLOW_MS),
    ).toMatchObject({ label: 'Synchronizing', syncing: true, reported: true });
  });

  it('expects the first sync of a new workspace for a while, without waiting Synchronize for it', () => {
    const created = { ...base, createdAt: '2026-10-02T00:00:00Z' };
    expect(syncState(created, undefined, now + 10_000)).toMatchObject({
      label: 'Synchronizing',
      syncing: true,
      reported: false,
      when: { verb: 'Created', at: '2026-10-02T00:00:00Z' },
    });
    // Not forever: past the follow window it says what the read says.
    expect(syncState(created, undefined, now + SYNC_FOLLOW_MS)).toMatchObject({
      label: 'Not synchronized yet',
      syncing: false,
    });
  });

  it('names what started an expected sync, wherever it is shown', () => {
    const created = { ...base, createdAt: '2026-10-01T23:59:59Z' };
    expect(
      syncState(created, { cause: 'created', after: '', since: now }, now).when,
    ).toEqual({ verb: 'Created', at: '2026-10-01T23:59:59Z' });
    expect(
      syncState(
        { ...base, lastSync: { time: 't', result: 'Succeeded' } },
        { cause: 'changed', after: 't', since: now },
        now,
      ),
    ).toMatchObject({
      reported: false,
      when: { verb: 'Changed', at: '2026-10-02T00:00:00.000Z' },
    });
  });

  it('is synchronizing after the person started a sync, until a read shows it ended', () => {
    const last = { time: '2026-10-01T12:00:00Z', result: 'Succeeded' as const };
    const awaited = {
      cause: 'requested' as const,
      after: last.time,
      since: now,
    };
    // The read after the request does not show it yet; the manager accepted
    // it, so Synchronize waits.
    expect(
      syncState({ ...base, lastSync: last }, awaited, now + 1000),
    ).toMatchObject({ label: 'Synchronizing', syncing: true, reported: true });
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
        { after },
      ),
    ).toBe(false);
    expect(
      syncEnded(
        {
          ...base,
          lastSync: later,
          activeSync: { job: 'j', startedAt: after },
        },
        { after },
      ),
    ).toBe(false);
    expect(
      syncEnded({ ...base, lastSync: { ...later, time: after } }, { after }),
    ).toBe(false);
    expect(syncEnded(base, { after: '' })).toBe(false);
  });

  it('ends with another last sync, failed or not', () => {
    expect(
      syncEnded(
        {
          ...base,
          lastSync: { time: '2026-10-01T12:05:00Z', result: 'Failed' },
        },
        { after },
      ),
    ).toBe(true);
    expect(
      syncEnded(
        {
          ...base,
          lastSync: { time: '2026-10-01T12:05:00Z', result: 'NoChange' },
        },
        { after: '' },
      ),
    ).toBe(true);
  });

  it('waits out the sync that ran when a change was saved, for the change’s own', () => {
    const awaited = { after, behind: 'sync-1' };
    // The sync that ran at the save ended…
    expect(
      syncEnded(
        {
          ...base,
          lastSync: {
            time: '2026-10-01T12:05:00Z',
            result: 'Succeeded',
            job: 'sync-1',
          },
        },
        awaited,
      ),
    ).toBe(false);
    // …then the change's own.
    expect(
      syncEnded(
        {
          ...base,
          lastSync: {
            time: '2026-10-01T12:07:00Z',
            result: 'Succeeded',
            job: 'sync-2',
          },
        },
        awaited,
      ),
    ).toBe(true);
  });
});

describe('syncRefetchInterval', () => {
  const startedAt = '2026-10-02T00:00:00Z';
  const start = Date.parse(startedAt);
  const running = { ...base, activeSync: { job: 'j', startedAt } };

  it('reads a sync the manager reports often at first, then less often, until it ends', () => {
    expect(syncRefetchInterval(running, undefined, start + 1000)).toBe(
      SYNC_REFETCH_MS,
    );
    expect(syncRefetchInterval(running, undefined, start + 5 * 60_000)).toBe(
      SYNC_REFETCH_SLOW_MS,
    );
    // A long sync, or a browser clock ahead of the manager's.
    expect(
      syncRefetchInterval(running, undefined, start + 2 * SYNC_FOLLOW_MS),
    ).toBe(SYNC_REFETCH_SLOW_MS);
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

  it('follows a new workspace and a sync the person started, for a while', () => {
    const created = { ...base, createdAt: startedAt };
    expect(syncRefetchInterval(created, undefined, start)).toBe(
      SYNC_REFETCH_MS,
    );
    expect(
      syncRefetchInterval(created, undefined, start + SYNC_FOLLOW_MS),
    ).toBe(false);
    const changed = {
      ...base,
      lastSync: { time: 'x', result: 'Succeeded' as const },
    };
    const awaited = { cause: 'changed' as const, after: 'x', since: start };
    expect(syncRefetchInterval(changed, awaited, start)).toBe(SYNC_REFETCH_MS);
    expect(syncRefetchInterval(changed, awaited, start + SYNC_FOLLOW_MS)).toBe(
      false,
    );
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
        () => ({ cause: 'changed', after: 't', since: now }),
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
