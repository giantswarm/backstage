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
import { useDeleteSession } from './useDeleteSession';

const deleteSession = jest.fn();

const kagentApi = { deleteSession } as unknown as KagentApi;

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
    ...renderHook(() => useDeleteSession('gazelle', 'abc'), { wrapper }),
    invalidateQueries,
  };
}

/** The filters a given call to `invalidateQueries` was made with. */
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
  deleteSession.mockReset();
  deleteSession.mockResolvedValue(undefined);
});

describe('useDeleteSession', () => {
  it('deletes the session on the installation it was read from', async () => {
    const { result } = renderWith();

    await act(async () => {
      await result.current.deleteSession();
    });

    expect(deleteSession).toHaveBeenCalledWith('gazelle', 'abc');
  });

  it('refreshes the sessions list', async () => {
    // The same key `SessionsDataProvider` and `useAgentSessions` read from, so
    // both the fleet list and the agent page's recent sessions card correct
    // themselves without either knowing a delete happened.
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current.deleteSession();
    });

    expect(
      invalidationFor(invalidateQueries, [
        'agent-platform',
        'kagent',
        'sessions',
        'gazelle',
      ]),
    ).toBeDefined();
  });

  it('marks this session’s own reads stale without refetching them', async () => {
    // The detail page is still mounted when this runs — it is where the delete was
    // triggered — so a refetch would race the navigation with a request that now
    // 404s and flash "Session not found" at someone who already knows.
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current.deleteSession();
    });

    for (const key of [
      ['agent-platform', 'kagent', 'session', 'gazelle', 'abc'],
      ['agent-platform', 'kagent', 'session-tasks', 'gazelle', 'abc'],
    ]) {
      expect(invalidationFor(invalidateQueries, key)).toMatchObject({
        refetchType: 'none',
      });
    }
  });

  it('reports a failure and rejects, leaving the caller to decide', async () => {
    deleteSession.mockRejectedValue(new Error('kagent said no'));

    const { result } = renderWith();

    await act(async () => {
      await expect(result.current.deleteSession()).rejects.toThrow(
        'kagent said no',
      );
    });

    await waitFor(() =>
      expect(result.current.error?.message).toBe('kagent said no'),
    );
  });

  it('does not refresh anything when the delete failed', async () => {
    deleteSession.mockRejectedValue(new Error('kagent said no'));

    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await expect(result.current.deleteSession()).rejects.toThrow();
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('clears a previous failure on reset, so a reopened dialog is clean', async () => {
    deleteSession.mockRejectedValue(new Error('kagent said no'));

    const { result } = renderWith();

    await act(async () => {
      await expect(result.current.deleteSession()).rejects.toThrow();
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.reset());

    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it('keeps a stable identity between renders', async () => {
    // The page memoizes the header actions element on this object, so a new one on
    // every render would re-register the header slot on every poll.
    const { result, rerender } = renderWith();

    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });
});
