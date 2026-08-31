import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  InvalidateQueryFilters,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi } from '../apis/types';
import type { AgentRow } from '../components/AgentsDataProvider';
import { useCreateSession } from './useCreateSession';

const createSession = jest.fn();

const kagentApi = { createSession } as unknown as KagentApi;

const SESSIONS_KEY = ['agent-platform', 'kagent', 'sessions', 'gazelle'];

const agent: AgentRow = {
  id: 'gazelle/kagent/sre-agent',
  installation: 'gazelle',
  namespace: 'kagent',
  name: 'SRE Agent',
  technicalName: 'sre-agent',
  description: 'Investigates incidents',
  skillCount: 3,
  readiness: 'ready',
};

function renderWith() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');

  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );

  return {
    ...renderHook(() => useCreateSession(), { wrapper }),
    invalidateQueries,
  };
}

function invalidationFor(
  invalidateQueries: jest.SpyInstance,
  queryKey: unknown[],
): InvalidateQueryFilters | undefined {
  const call = invalidateQueries.mock.calls.find(
    ([filters]) =>
      JSON.stringify(filters?.queryKey) === JSON.stringify(queryKey),
  );
  return call?.[0];
}

beforeEach(() => {
  createSession.mockReset();
  createSession.mockResolvedValue({ sessionId: 'new-session-id' });
});

describe('useCreateSession', () => {
  it('creates the session on the agent’s own installation and returns its id', async () => {
    const { result } = renderWith();

    let sessionId: string | undefined;
    await act(async () => {
      sessionId = await result.current.createSession({
        agent,
        prompt: 'Why is the ingress failing?',
      });
    });

    expect(sessionId).toBe('new-session-id');
    expect(createSession).toHaveBeenCalledWith(
      'gazelle',
      { namespace: 'kagent', name: 'sre-agent' },
      'Why is the ingress failing?',
    );
  });

  it('sends the agent’s technical name, not its display name', async () => {
    // kagent resolves `agent_ref` against the resource name. The display name is
    // an annotation and would match nothing.
    const { result } = renderWith();

    await act(async () => {
      await result.current.createSession({
        agent,
        prompt: 'Check the cluster',
      });
    });

    expect(createSession.mock.calls[0][1]).toEqual({
      namespace: 'kagent',
      name: 'sre-agent',
    });
  });

  it('derives the title from the prompt, because kagent does not', async () => {
    const { result } = renderWith();

    await act(async () => {
      await result.current.createSession({
        agent,
        prompt:
          'Investigate why the ingress controller keeps restarting on the gazelle management cluster',
      });
    });

    expect(createSession.mock.calls[0][2]).toBe(
      'Investigate why the ingress controller keeps restarting on…',
    );
  });

  it('marks the installation’s sessions list stale without refetching it', async () => {
    // The caller navigates away from the list at once, so a refetch here would
    // spend a fleet-wide query on a screen nobody is looking at.
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current.createSession({ agent, prompt: 'Check' });
    });

    expect(invalidationFor(invalidateQueries, SESSIONS_KEY)).toMatchObject({
      refetchType: 'none',
    });
  });

  it('surfaces a failure without inventing a session id', async () => {
    createSession.mockRejectedValue(
      new Error('kagent did not accept the agent'),
    );
    const { result } = renderWith();

    await act(async () => {
      await expect(
        result.current.createSession({ agent, prompt: 'Check' }),
      ).rejects.toThrow('kagent did not accept the agent');
    });

    await waitFor(() => {
      expect(result.current.error?.message).toBe(
        'kagent did not accept the agent',
      );
    });
  });

  it('keeps a stable identity across re-renders', async () => {
    // The composer passes these down; a new object every render would re-render
    // it on every unrelated poll.
    const { result, rerender } = renderWith();
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
