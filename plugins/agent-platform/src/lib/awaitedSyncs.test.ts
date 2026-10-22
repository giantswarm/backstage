import { QueryClient } from '@tanstack/react-query';

import { awaitedSyncs, awaitSync, forgetEndedSyncs } from './awaitedSyncs';
import { SYNC_FOLLOW_MS } from './workspaceList';
import type { Workspace } from './workspaceManager';

const workspace = (name: string, overrides: Partial<Workspace> = {}) =>
  ({
    name,
    organization: 'alpha',
    sources: [],
    sync: { schedule: 'nightly' },
    resourceVersion: '1',
    createdAt: '2026-10-01T00:00:00Z',
    lastSync: { time: '2026-10-01T12:00:00Z', result: 'Succeeded' },
    repositories: 0,
    sessions: 0,
    ...overrides,
  }) as Workspace;

describe('awaited syncs', () => {
  it('records a sync per workspace, and forgets it once a read shows it ended or it is no longer expected', () => {
    const queryClient = new QueryClient();
    const awaited = {
      cause: 'changed' as const,
      after: '2026-10-01T12:00:00Z',
      since: Date.now(),
    };
    awaitSync(queryClient, 'gazelle', 'docs', awaited);
    awaitSync(queryClient, 'gazelle', 'infra', {
      ...awaited,
      since: Date.now() - SYNC_FOLLOW_MS,
    });
    awaitSync(queryClient, 'gazelle', 'mcp', awaited);

    forgetEndedSyncs(queryClient, 'gazelle', [
      // Not ended yet.
      workspace('docs'),
      // Given up on.
      workspace('infra'),
      // Ended.
      workspace('mcp', {
        lastSync: { time: '2026-10-01T12:05:00Z', result: 'Succeeded' },
      }),
    ]);

    expect(awaitedSyncs(queryClient)).toEqual({ 'gazelle/docs': awaited });
    awaitSync(queryClient, 'gazelle', 'docs', undefined);
    expect(awaitedSyncs(queryClient)).toEqual({});
  });
});
