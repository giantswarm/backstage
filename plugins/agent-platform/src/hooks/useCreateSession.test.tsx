import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import {
  InvalidateQueryFilters,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';
import type { AgentRow } from '../components/AgentsDataProvider';
import {
  useCreateSession,
  type SessionEntryPoint,
  type UseCreateSessionOptions,
} from './useCreateSession';

/**
 * agent-manager's `start_session` behind muster, as the controller keys it: a
 * repeated `requestId` answers the session the first call created.
 */
const sessionsByRequest = new Map<string, string>();
const callTool = jest.fn(
  async (
    _name: string,
    args: Record<string, unknown>,
    _installation?: string,
  ): Promise<unknown> => {
    const requestId = String(args.requestId);
    if (!sessionsByRequest.has(requestId)) {
      sessionsByRequest.set(
        requestId,
        sessionsByRequest.size === 0
          ? 'new-session-id'
          : `session-${sessionsByRequest.size + 1}`,
      );
    }
    return { session: { id: sessionsByRequest.get(requestId) } };
  },
);
const musterApi = { callTool } as unknown as MusterApi;

/** The arguments of each `start_session` call, in order. */
function startCalls() {
  return callTool.mock.calls.map(([name, args, installation]) => ({
    name,
    args,
    installation,
  }));
}

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

const analyticsApi = mockApis.analytics.mock();

function renderWith(
  entryPoint: SessionEntryPoint = 'agentDetail',
  options?: UseCreateSessionOptions,
) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');

  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [musterApiRef, musterApi],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );

  return {
    ...renderHook(() => useCreateSession(entryPoint, options), { wrapper }),
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
  jest.mocked(analyticsApi.captureEvent).mockClear();
  callTool.mockClear();
  sessionsByRequest.clear();
});

describe('useCreateSession', () => {
  it('starts the session through start_session on the agent’s own installation and returns its id', async () => {
    const { result } = renderWith();

    let sessionId: string | undefined;
    await act(async () => {
      sessionId = await result.current.createSession({
        agent,
        prompt: 'Why is the ingress failing?',
      });
    });

    expect(sessionId).toBe('new-session-id');
    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_start_session',
      {
        namespace: 'kagent',
        name: 'sre-agent',
        // agent-manager sends the prompt as the session's first message.
        message: 'Why is the ingress failing?',
        // One idempotency key per submission, so a retried start is the same start.
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        sessionName: 'Why is the ingress failing?',
      },
      'gazelle',
    );
  });

  it('titles the session with up to titleMaxLength characters of the prompt', async () => {
    const prompt = `Investigate ${'the restarting ingress controller '.repeat(3)}`;
    const { result } = renderWith('home', { titleMaxLength: 199 });

    await act(async () => {
      await result.current.createSession({ agent, prompt });
    });

    expect(startCalls()[0].args.sessionName).toBe(prompt.trim());
  });

  it('reports the started session with its entry point', async () => {
    const { result } = renderWith();

    await act(async () => {
      await result.current.createSession({ agent, prompt: 'Check' });
    });

    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.sessionStarted',
        attributes: { entryPoint: 'agentDetail' },
      }),
    );
  });

  it('reports a session started from the home page as such', async () => {
    const { result } = renderWith('home');

    await act(async () => {
      await result.current.createSession({ agent, prompt: 'Check' });
    });

    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.sessionStarted',
        attributes: { entryPoint: 'home' },
      }),
    );
  });

  it('reports a session started from the create-agent assist as such', async () => {
    const { result } = renderWith('createAgentAssist');

    await act(async () => {
      await result.current.createSession({ agent, prompt: 'Draft an agent' });
    });

    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.sessionStarted',
        attributes: { entryPoint: 'createAgentAssist' },
      }),
    );
  });

  it("reports a session started from the skill forms' skill-creator hand-off as such", async () => {
    const { result } = renderWith('skillCreationAssist');

    await act(async () => {
      await result.current.createSession({ agent, prompt: 'Write a skill' });
    });

    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.sessionStarted',
        attributes: { entryPoint: 'skillCreationAssist' },
      }),
    );
  });

  it.each([
    ['the workflow page’s hand-off to the workflow agent', 'workflowEdit'],
    ['the workflows overview’s create hint', 'workflowCreateAssist'],
  ] as const)(
    'reports a session started from %s as such',
    async (_, entryPoint) => {
      const { result } = renderWith(entryPoint);

      await act(async () => {
        await result.current.createSession({ agent, prompt: 'A workflow' });
      });

      expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AgentPlatform.sessionStarted',
          attributes: { entryPoint },
        }),
      );
    },
  );

  it('reports a session started from the ⌘K search palette as such', async () => {
    const { result } = renderWith('searchPalette');

    await act(async () => {
      await result.current.createSession({ agent, prompt: 'Check' });
    });

    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.sessionStarted',
        attributes: { entryPoint: 'searchPalette' },
      }),
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

    expect(startCalls()[0].args).toMatchObject({
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

    expect(startCalls()[0].args.sessionName).toBe(
      'Investigate why the ingress controller keeps restarting on…',
    );
  });

  it('invalidates the installation’s sessions list so mounted lists refetch at once', async () => {
    // The shell rail's session history stays mounted through the navigation,
    // so the default (active) refetch is what makes the new session appear in
    // the sidebar immediately. `refetchType: 'none'` here is the bug this
    // guards against.
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current.createSession({ agent, prompt: 'Check' });
    });

    const invalidation = invalidationFor(invalidateQueries, SESSIONS_KEY);
    expect(invalidation).toBeDefined();
    expect(invalidation).not.toMatchObject({ refetchType: 'none' });
  });

  it('invalidates the installation’s session states, which group and mark the rail', async () => {
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current.createSession({ agent, prompt: 'Check' });
    });

    const invalidation = invalidationFor(invalidateQueries, [
      'agent-platform',
      'kagent',
      'session-states',
      'gazelle',
    ]);
    expect(invalidation).toBeDefined();
    expect(invalidation).not.toMatchObject({ refetchType: 'none' });
  });

  it('does not invalidate anything when the start fails', async () => {
    callTool.mockRejectedValueOnce(new Error('kagent is down'));
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current
        .createSession({ agent, prompt: 'Check' })
        .catch(() => {});
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('surfaces a failure without inventing a session id', async () => {
    callTool.mockRejectedValueOnce(
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
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it('keeps a stable identity across re-renders', async () => {
    // The composer passes these down; a new object every render would re-render
    // it on every unrelated poll.
    const { result, rerender } = renderWith();
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it('reuses the idempotency key when the same prompt is retried after a failure', async () => {
    callTool.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderWith();

    await act(async () => {
      await result.current
        .createSession({ agent, prompt: 'Why is the ingress failing?' })
        .catch(() => {});
    });
    await act(async () => {
      await result.current.createSession({
        agent,
        prompt: 'Why is the ingress failing?',
      });
    });

    const keys = startCalls().map(call => call.args.requestId);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('mints a new key for a different prompt, and after a successful create', async () => {
    const { result } = renderWith();

    await act(async () => {
      await result.current.createSession({ agent, prompt: 'first' });
    });
    await act(async () => {
      await result.current.createSession({ agent, prompt: 'first' });
    });
    await act(async () => {
      await result.current.createSession({ agent, prompt: 'second' });
    });

    const keys = startCalls().map(call => call.args.requestId);
    expect(new Set(keys).size).toBe(3);
  });

  it('starts one session, not two, when a submission is retried with its key', async () => {
    // The first answer is lost on its way back: agent-manager started the
    // session, the browser saw a failure. The retry carries the same key and
    // lands on that session.
    callTool.mockImplementationOnce(async (_name, args) => {
      sessionsByRequest.set(String(args.requestId), 'new-session-id');
      throw new Error('network down');
    });
    const { result } = renderWith();

    await act(async () => {
      await result.current
        .createSession({ agent, prompt: 'Why is the ingress failing?' })
        .catch(() => {});
    });
    let sessionId: string | undefined;
    await act(async () => {
      sessionId = await result.current.createSession({
        agent,
        prompt: 'Why is the ingress failing?',
      });
    });

    expect(callTool).toHaveBeenCalledTimes(2);
    expect(sessionsByRequest.size).toBe(1);
    expect(sessionId).toBe('new-session-id');
  });

  it('fails without the muster plugin, the only way to reach agent-manager', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren<{}>) => (
      <TestApiProvider apis={[[analyticsApiRef, analyticsApi]]}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </TestApiProvider>
    );
    const { result } = renderHook(() => useCreateSession('agentDetail'), {
      wrapper,
    });

    await act(async () => {
      await expect(
        result.current.createSession({ agent, prompt: 'Check' }),
      ).rejects.toThrow(/muster plugin/);
    });
  });
});
