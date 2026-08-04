import { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentSession } from '../lib/kagentSessions';
import { useAgentSessions } from './useAgentSessions';

jest.mock('./useKagentCapabilities', () => ({
  useKagentCapabilities: () => ({ isUserScoped: true }),
}));

const SESSIONS_KEY = ['agent-platform', 'kagent', 'sessions', 'gazelle'];

/** kagent encodes an agent id as `namespace/name` with `-` → `_`, `/` → `__NS__`. */
const AGENT_ID = 'agentic_platform__NS__pr_reviewer';

function session(id: string): KagentSession {
  return {
    id: `gazelle/${id}`,
    sessionId: id,
    installation: 'gazelle',
    title: 'Reviewing a PR',
    agentId: AGENT_ID,
    createdAt: '2026-07-31T10:00:00Z',
    updatedAt: '2026-07-31T10:05:00Z',
  };
}

function renderAgentSessions(listSessions: jest.Mock, seed?: KagentSession[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // Seeding stands in for the Sessions tab having already populated this exact
  // query key — the two share it deliberately.
  if (seed) {
    queryClient.setQueryData(SESSIONS_KEY, seed);
  }

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TestApiProvider apis={[[kagentApiRef, { listSessions }]]}>
        {children}
      </TestApiProvider>
    </QueryClientProvider>
  );

  return renderHook(
    () => useAgentSessions('gazelle', 'agentic-platform', 'pr-reviewer'),
    { wrapper },
  );
}

describe('useAgentSessions', () => {
  it('returns only the sessions belonging to this agent', async () => {
    const listSessions = jest
      .fn()
      .mockResolvedValue([
        session('a'),
        { ...session('b'), agentId: 'kagent__NS__other_agent' },
      ]);

    const { result } = renderAgentSessions(listSessions);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rows.map(row => row.sessionId)).toEqual(['a']);
    expect(result.current.isUnavailable).toBe(false);
  });

  it('reports unavailable when the first read fails', async () => {
    const listSessions = jest.fn().mockRejectedValue(new Error('503'));

    const { result } = renderAgentSessions(listSessions);

    await waitFor(() => expect(result.current.isUnavailable).toBe(true));

    expect(result.current.rows).toEqual([]);
  });

  // react-query keeps `data` and sets `error` on a failed *refetch*. Since this
  // query is shared with the Sessions tab, arriving from that tab after its entry
  // went stale triggers a background refetch whose failure must not hide sessions
  // that were already read and are still correct.
  it('keeps cached sessions when a background refetch fails', async () => {
    const listSessions = jest.fn().mockRejectedValue(
      Object.assign(new Error('service unavailable'), {
        name: 'ServiceUnavailableError',
      }),
    );

    const { result } = renderAgentSessions(listSessions, [session('a')]);

    // The mount-time refetch fails while the seeded data is still held.
    await waitFor(() => expect(listSessions).toHaveBeenCalled());

    expect(result.current.rows.map(row => row.sessionId)).toEqual(['a']);
    expect(result.current.isUnavailable).toBe(false);
  });
});
