import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { useNotifiableSessions } from './useNotifiableSessions';

const mockRows = [
  {
    id: 'gazelle/s1',
    sessionId: 's1',
    installation: 'gazelle',
    title: 'Debug ingress',
    agentName: 'SRE Agent',
    agentTechnicalName: 'sre-agent',
  },
];

jest.mock('../components/SessionsDataProvider', () => ({
  useSessions: () => ({ rows: mockRows, isLoading: false }),
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

function renderSessions(listSessionStates: jest.Mock) {
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
  return renderHook(() => useNotifiableSessions(), { wrapper });
}

describe('useNotifiableSessions', () => {
  beforeEach(() => {
    hidden = false;
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
