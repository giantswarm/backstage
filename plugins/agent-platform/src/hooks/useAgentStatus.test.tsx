import { ReactNode } from 'react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import {
  FAILED_STATUS_POLL_INITIAL_MS,
  FAILED_STATUS_POLL_MAX_AGE_MS,
  useAgentStatus,
} from './useAgentStatus';

/** When each agent's status was read, by agent name, on the fake clock. */
let readAt: Record<string, number[]>;

const callTool = jest.fn(
  async (_tool: string, args: { namespace: string; name: string }) => {
    (readAt[args.name] ??= []).push(Date.now());
    return {
      name: args.name,
      namespace: args.namespace,
      verdict: 'failed',
      summary: `${args.name} failed.`,
    };
  },
);
const musterApi = { callTool } as unknown as MusterApi;

async function wait(ms: number) {
  await act(() => jest.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  jest.useFakeTimers();
  readAt = {};
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useAgentStatus', () => {
  // The detail page keeps its hooks across a navigation from one agent to
  // another, so the backoff has to start over with each agent it watches.
  it('starts the failed-verdict backoff over for each agent it is switched to', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestApiProvider apis={[[musterApiRef, musterApi]]}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </TestApiProvider>
    );
    const { rerender } = renderHook(
      ({ name }: { name: string }) => useAgentStatus('gazelle', 'kagent', name),
      { wrapper, initialProps: { name: 'a' } },
    );

    // Agent a fails for nearly the whole of its ten minutes.
    await wait(FAILED_STATUS_POLL_MAX_AGE_MS - 60_000);
    rerender({ name: 'b' });
    await wait(2 * FAILED_STATUS_POLL_INITIAL_MS);

    // Back on a, its failure from the first visit no longer counts: it is
    // re-read 5 s after the fresh answer, not taken as final.
    const before = readAt.a.length;
    rerender({ name: 'a' });
    await wait(FAILED_STATUS_POLL_INITIAL_MS);
    const since = readAt.a.slice(before);

    expect(readAt.b[1] - readAt.b[0]).toBe(FAILED_STATUS_POLL_INITIAL_MS);
    expect(since).toHaveLength(2);
    expect(since[1] - since[0]).toBe(FAILED_STATUS_POLL_INITIAL_MS);
  });
});
