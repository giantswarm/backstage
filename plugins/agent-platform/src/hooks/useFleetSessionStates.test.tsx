import { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionStatesResponse } from '@giantswarm/backstage-plugin-agent-platform-common';
import { kagentApiRef } from '../apis';
import { useFleetSessionStates } from './useFleetSessionStates';

function response(
  overrides: Partial<SessionStatesResponse> = {},
): SessionStatesResponse {
  return {
    evaluatedAt: 1,
    states: [],
    unreadable: [],
    skipped: 0,
    ...overrides,
  };
}

function renderFleetStates(
  installations: string[],
  listSessionStates: jest.Mock,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TestApiProvider apis={[[kagentApiRef, { listSessionStates }]]}>
        {children}
      </TestApiProvider>
    </QueryClientProvider>
  );

  return renderHook(() => useFleetSessionStates(installations), { wrapper });
}

describe('useFleetSessionStates', () => {
  it('asks nothing when there is no installation to ask', async () => {
    const listSessionStates = jest.fn();

    const { result } = renderFleetStates([], listSessionStates);

    expect(listSessionStates).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.states.size).toBe(0);
  });

  it('keys each state by installation and session, so two installations cannot collide', async () => {
    const listSessionStates = jest.fn(async (installation: string) =>
      response({
        states: [
          {
            sessionId: 'abc',
            state: installation === 'gazelle' ? 'working' : 'completed',
          },
        ],
      }),
    );

    const { result } = renderFleetStates(
      ['gazelle', 'golem'],
      listSessionStates,
    );

    await waitFor(() => expect(result.current.states.size).toBe(2));
    expect(result.current.states.get('gazelle/abc')?.state).toBe('working');
    expect(result.current.states.get('golem/abc')?.state).toBe('completed');
  });

  it('sums what no installation evaluated', async () => {
    const listSessionStates = jest.fn(async () => response({ skipped: 3 }));

    const { result } = renderFleetStates(
      ['gazelle', 'golem'],
      listSessionStates,
    );

    await waitFor(() => expect(result.current.skippedCount).toBe(6));
  });

  it('names the installation that failed, and keeps the one that answered', async () => {
    // One failure must not make the other installation's rows unknown.
    const listSessionStates = jest.fn(async (installation: string) => {
      if (installation === 'golem') {
        throw new Error('nope');
      }
      return response({ states: [{ sessionId: 'abc', state: 'working' }] });
    });

    const { result } = renderFleetStates(
      ['gazelle', 'golem'],
      listSessionStates,
    );

    await waitFor(() =>
      expect(result.current.failedInstallations.has('golem')).toBe(true),
    );
    expect(result.current.states.get('gazelle/abc')?.state).toBe('working');
    // Not an error: one installation answered, so the column has something to
    // say.
    expect(result.current.isError).toBe(false);
  });

  it('keeps the same view object while nothing has been read again', async () => {
    // The table joins these onto every row; a fresh object each render would
    // redo the join for nothing.
    const listSessionStates = jest.fn(async () =>
      response({ states: [{ sessionId: 'abc', state: 'working' }] }),
    );

    const { result, rerender } = renderFleetStates(
      ['gazelle'],
      listSessionStates,
    );

    await waitFor(() => expect(result.current.states.size).toBe(1));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
