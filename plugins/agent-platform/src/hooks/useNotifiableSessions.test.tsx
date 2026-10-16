import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { useNotifiableSessions } from './useNotifiableSessions';

const gazelleRow = {
  id: 'gazelle/s1',
  sessionId: 's1',
  installation: 'gazelle',
  title: 'Debug ingress',
  agentName: 'SRE Agent',
  agentTechnicalName: 'sre-agent',
};
let mockRows = [gazelleRow];

jest.mock('../components/SessionsDataProvider', () => ({
  useSessions: () => ({
    rows: mockRows,
    isLoading: false,
    isLoadingMore: false,
  }),
}));

jest.mock('./useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => (installation: string, name: string) =>
    `/avatars/${installation}/${name}`,
}));

let hidden = false;

function setHidden(next: boolean) {
  hidden = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeAll(() => {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
});

afterAll(() => {
  delete (document as { hidden?: boolean }).hidden;
});

function renderSessions(
  listSessionStates: jest.Mock,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TestApiProvider apis={[[kagentApiRef, { listSessionStates }]]}>
        {children}
      </TestApiProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useNotifiableSessions(), { wrapper });
}

describe('useNotifiableSessions', () => {
  beforeEach(() => {
    hidden = false;
    mockRows = [gazelleRow];
  });

  function answer(states: Array<{ sessionId: string; state: string }>) {
    return { evaluatedAt: 1, states, unreadable: [], skipped: 0 };
  }

  it('is read only once every installation has answered', async () => {
    mockRows = [
      gazelleRow,
      { ...gazelleRow, id: 'golem/s2', sessionId: 's2', installation: 'golem' },
    ];
    let answerGolem: (value: unknown) => void = () => {};
    const listSessionStates = jest.fn((installation: string) =>
      installation === 'golem'
        ? new Promise(resolve => {
            answerGolem = resolve;
          })
        : Promise.resolve(answer([{ sessionId: 's1', state: 'working' }])),
    );

    const { result } = renderSessions(listSessionStates);

    await waitFor(() =>
      expect(result.current.states.get('gazelle/s1')).toBeDefined(),
    );
    expect(result.current.isRead).toBe(false);

    await act(async () => {
      answerGolem(answer([{ sessionId: 's2', state: 'input-required' }]));
    });
    await waitFor(() => expect(result.current.isRead).toBe(true));
  });

  it('reads the list again, once, when a state names a session it does not know', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const listSessionStates = jest.fn(async () =>
      answer([
        { sessionId: 's1', state: 'working' },
        { sessionId: 'new', state: 'input-required' },
      ]),
    );

    const { result } = renderSessions(listSessionStates, queryClient);

    await waitFor(() => expect(result.current.isRead).toBe(true));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['agent-platform', 'kagent', 'sessions', 'gazelle'],
    });

    await act(async () => {
      await queryClient.refetchQueries();
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('names each session as a notification does, with its state', async () => {
    const listSessionStates = jest.fn(async () => ({
      evaluatedAt: 1,
      states: [{ sessionId: 's1', state: 'input-required' }],
      unreadable: [],
      skipped: 0,
    }));

    const { result } = renderSessions(listSessionStates);

    await waitFor(() => expect(result.current.isRead).toBe(true));
    expect(result.current.sessions.get('gazelle/s1')).toEqual({
      id: 'gazelle/s1',
      installation: 'gazelle',
      sessionId: 's1',
      title: 'Debug ingress',
      agentName: 'SRE Agent',
      avatarUrl: '/avatars/gazelle/sre-agent',
    });
    expect(result.current.states.get('gazelle/s1')?.state).toBe(
      'input-required',
    );
  });

  it('reads every 10 s while the tab is visible, and goes on every 60 s while it is hidden', async () => {
    jest.useFakeTimers();
    try {
      const listSessionStates = jest.fn(async () => ({
        evaluatedAt: 1,
        states: [],
        unreadable: [],
        skipped: 0,
      }));
      renderSessions(listSessionStates);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(listSessionStates).toHaveBeenCalledTimes(1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(10_000);
      });
      expect(listSessionStates).toHaveBeenCalledTimes(2);

      act(() => setHidden(true));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(30_000);
      });
      expect(listSessionStates).toHaveBeenCalledTimes(2);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(30_000);
      });
      expect(listSessionStates).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });
});
