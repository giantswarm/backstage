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
import { useAnswerConfirmation } from './useAnswerConfirmation';

const answerConfirmation = jest.fn();

const kagentApi = { answerConfirmation } as unknown as KagentApi;

const SESSION_KEY = ['agent-platform', 'kagent', 'session', 'gazelle', 'abc'];
const TASKS_KEY = [
  'agent-platform',
  'kagent',
  'session-tasks',
  'gazelle',
  'abc',
];

const agent = { namespace: 'kagent', name: 'grill-master' };

// Two entry points rather than one taking `undefined`: passing `undefined` to a
// parameter with a default silently gets the default, so a "no agent" test would
// have exercised the opposite of what it claims. Bitten once already in this plugin.
function renderWithoutAgent() {
  return renderWith(undefined);
}

function renderWith(withAgent: typeof agent | undefined) {
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
    ...renderHook(() => useAnswerConfirmation('gazelle', 'abc', withAgent), {
      wrapper,
    }),
    invalidateQueries,
  };
}

function invalidationFor(
  invalidateQueries: jest.SpyInstance,
  queryKey: unknown[],
): InvalidateQueryFilters | undefined {
  return invalidateQueries.mock.calls.find(
    ([filters]) =>
      JSON.stringify(filters?.queryKey) === JSON.stringify(queryKey),
  )?.[0];
}

beforeEach(() => {
  answerConfirmation.mockReset();
  answerConfirmation.mockResolvedValue(undefined);
});

describe('useAnswerConfirmation', () => {
  it('forwards the answer with a generated message id', async () => {
    const { result } = renderWith(agent);

    await act(async () => {
      await result.current.answer({
        taskId: 'task-1',
        decision: 'approve',
        answers: [['A rideable bike']],
        text: 'A rideable bike',
      });
    });

    expect(answerConfirmation).toHaveBeenCalledWith('gazelle', 'abc', agent, {
      messageId: expect.any(String),
      taskId: 'task-1',
      decision: 'approve',
      answers: [['A rideable bike']],
      text: 'A rideable bike',
    });
  });

  it('refuses to answer when the session’s agent is unknown', async () => {
    // Without the agent there is no A2A endpoint to address, and guessing one
    // would strand the task it was trying to resume.
    const { result } = renderWithoutAgent();

    await act(async () => {
      await expect(
        result.current.answer({ taskId: 'task-1', decision: 'approve' }),
      ).rejects.toThrow(/agent for this session is unknown/);
    });

    expect(answerConfirmation).not.toHaveBeenCalled();
  });

  it('refreshes the conversation, so the resumed turn shows up', async () => {
    const { result, invalidateQueries } = renderWith(agent);

    await act(async () => {
      await result.current.answer({ taskId: 'task-1', decision: 'approve' });
    });

    expect(invalidationFor(invalidateQueries, TASKS_KEY)).toBeDefined();
    expect(invalidationFor(invalidateQueries, SESSION_KEY)).toBeDefined();
  });

  it('holds the answer as pending until it lands', async () => {
    let release: () => void = () => {};
    answerConfirmation.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        }),
    );
    const { result } = renderWith(agent);

    act(() => {
      result.current
        .answer({ taskId: 'task-1', decision: 'approve', text: 'yes' })
        .catch(() => {});
    });

    await waitFor(() => {
      expect(result.current.pending?.text).toBe('yes');
    });

    await act(async () => {
      release();
    });

    await waitFor(() => {
      expect(result.current.pending).toBeNull();
    });
  });

  it('hands a failed answer back rather than losing the choices', async () => {
    answerConfirmation.mockRejectedValue(new Error('kagent said no'));
    const { result } = renderWith(agent);

    await act(async () => {
      await expect(
        result.current.answer({
          taskId: 'task-1',
          decision: 'approve',
          answers: [['A rideable bike']],
        }),
      ).rejects.toThrow('kagent said no');
    });

    await waitFor(() => {
      expect(result.current.failed?.answers).toEqual([['A rideable bike']]);
      expect(result.current.pending).toBeNull();
      expect(result.current.error?.message).toBe('kagent said no');
    });
  });

  it('keeps a stable identity across re-renders', async () => {
    const { result, rerender } = renderWith(agent);
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
