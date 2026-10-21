import {
  isSyncing,
  lastPushes,
  lastSyncResult,
  pushedSinceSync,
  requestedSyncEnded,
  searchMirrors,
  sortedDirectories,
  sortedMirrors,
  syncTriggerLabel,
} from './workspaceDetail';
import type {
  Workspace,
  WorkspaceMirror,
  WorkspacePreview,
} from './workspaceManager';

const workspace: Workspace = {
  name: 'docs',
  organization: 'lab',
  sources: [{ provider: 'github', owner: 'example-org' }],
  sync: { schedule: 'nightly' },
  resourceVersion: '1',
  createdAt: '2026-10-01T00:00:00Z',
  repositories: 2,
  sessions: 0,
};

const mirror = (
  repository: string,
  extra: Partial<WorkspaceMirror> = {},
): WorkspaceMirror => ({
  provider: 'github',
  repository,
  pushedAt: '2026-10-20T10:00:00Z',
  sizeBytes: 1024,
  ...extra,
});

describe('lastSyncResult', () => {
  it('says a failure in the manager’s own words', () => {
    expect(
      lastSyncResult({
        time: '2026-10-20T10:00:00Z',
        result: 'Failed',
        message: 'owner example-org not reachable',
      }),
    ).toEqual({
      label: 'Failed',
      tone: 'danger',
      sentence:
        'The mirrors stay as they were: owner example-org not reachable',
    });
  });

  it('says an unchanged sync fetched nothing', () => {
    expect(
      lastSyncResult({ time: '2026-10-20T10:00:00Z', result: 'NoChange' }),
    ).toMatchObject({
      label: 'Unchanged',
      sentence: 'Nothing had changed, so nothing was fetched.',
    });
  });
});

describe('isSyncing', () => {
  it('follows a running or requested sync, not a deletion', () => {
    expect(
      isSyncing({
        ...workspace,
        activeSync: { job: 'sync-1', startedAt: '2026-10-20T11:00:00Z' },
      }),
    ).toBe(true);
    expect(
      isSyncing({
        ...workspace,
        syncRequest: { requestedAt: '2026-10-20T11:00:00Z' },
      }),
    ).toBe(true);
    expect(isSyncing({ ...workspace, deleting: true })).toBe(false);
  });
});

describe('syncTriggerLabel', () => {
  it('names what started a cycle, and nothing for none', () => {
    expect(syncTriggerLabel('request')).toBe(
      'A request: Sync now, or a Session starting on it',
    );
    expect(syncTriggerLabel('change')).toBe('A change to the workspace');
    expect(syncTriggerLabel('sessionDeleted')).toBe(
      'A deleted Session’s directory',
    );
    expect(syncTriggerLabel(undefined)).toBeUndefined();
  });
});

describe('requestedSyncEnded', () => {
  const requestedAt = '2026-10-20T10:00:00Z';

  it('waits while the sync runs or is still requested', () => {
    expect(
      requestedSyncEnded(
        {
          ...workspace,
          lastSync: { time: '2026-10-20T10:05:00Z', result: 'Succeeded' },
          syncRequest: { requestedAt },
        },
        requestedAt,
      ),
    ).toBe(false);
  });

  it('waits while the last cycle is older than the request', () => {
    expect(
      requestedSyncEnded(
        {
          ...workspace,
          lastSync: { time: '2026-10-20T09:00:00Z', result: 'Succeeded' },
        },
        requestedAt,
      ),
    ).toBe(false);
  });

  it('takes a cycle that ended in the request’s second for the one before', () => {
    expect(
      requestedSyncEnded(
        {
          ...workspace,
          lastSync: { time: requestedAt, result: 'Succeeded' },
        },
        requestedAt,
      ),
    ).toBe(false);
  });

  it('ends with a cycle after the request', () => {
    expect(
      requestedSyncEnded(
        {
          ...workspace,
          lastSync: { time: '2026-10-20T10:01:00Z', result: 'NoChange' },
        },
        requestedAt,
      ),
    ).toBe(true);
  });
});

describe('pushedSinceSync', () => {
  const preview = (lastPush: string): WorkspacePreview => ({
    total: 1,
    excluded: 0,
    skippedArchived: 0,
    skippedForks: 0,
    providerSizeKiB: 1,
    estimatedVolumeSize: '1Gi',
    matching: 1,
    page: 1,
    pageSize: 200,
    repositories: [
      {
        provider: 'github',
        repository: 'example-org/api',
        topics: [],
        lastPush,
        sizeKiB: 1,
        why: ['name'],
      },
    ],
  });

  it('marks a repository its provider lists a later push for', () => {
    const { pushes } = lastPushes([preview('2026-10-21T08:00:00Z')], false);
    expect(pushedSinceSync(mirror('example-org/api'), pushes)).toBe(true);
    expect(pushedSinceSync(mirror('example-org/web'), pushes)).toBe(false);
  });

  it('marks nothing at the same push or without the providers', () => {
    expect(
      pushedSinceSync(
        mirror('example-org/api'),
        lastPushes([preview('2026-10-20T10:00:00Z')], false).pushes,
      ),
    ).toBe(false);
    expect(pushedSinceSync(mirror('example-org/api'), undefined)).toBe(false);
  });
});

describe('mirrors and directories', () => {
  it('sorts by name, dropped mirrors last, and searches', () => {
    const sorted = sortedMirrors([
      mirror('example-org/zeta'),
      mirror('example-org/old', { droppedAt: '2026-10-19T00:00:00Z' }),
      mirror('example-org/alpha', { defaultBranch: 'trunk' }),
    ]);
    expect(sorted.map(m => m.repository)).toEqual([
      'example-org/alpha',
      'example-org/zeta',
      'example-org/old',
    ]);
    expect(searchMirrors(sorted, 'TRUNK').map(m => m.repository)).toEqual([
      'example-org/alpha',
    ]);
  });

  it('lists the latest turn first, unknown directories last', () => {
    expect(
      sortedDirectories([
        { session: 'a', sizeBytes: 1, lastTurn: '2026-10-01T00:00:00Z' },
        { session: 'gone', sizeBytes: 1, unknown: true },
        { session: 'b', sizeBytes: 1, lastTurn: '2026-10-10T00:00:00Z' },
      ]).map(d => d.session),
    ).toEqual(['b', 'a', 'gone']);
  });
});
