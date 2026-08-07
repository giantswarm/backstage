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
import { useRenameSession } from './useRenameSession';

const renameSession = jest.fn();

const kagentApi = { renameSession } as unknown as KagentApi;

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
    ...renderHook(() => useRenameSession('gazelle', 'abc'), { wrapper }),
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
  renameSession.mockReset();
  renameSession.mockResolvedValue(undefined);
});

describe('useRenameSession', () => {
  it('renames the session on the installation it was read from', async () => {
    const { result } = renderWith();

    await act(async () => {
      await result.current.renameSession('Quarterly capacity review');
    });

    expect(renameSession).toHaveBeenCalledWith(
      'gazelle',
      'abc',
      'Quarterly capacity review',
    );
  });

  it('refetches this session’s own read, unlike the delete', async () => {
    // The page stays mounted through a rename and has to show the new name, so
    // marking the read stale is not enough — this one has to actually refetch.
    // `refetchType: 'none'` here would leave the old title on screen.
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current.renameSession('New name');
    });

    const filters = invalidationFor(invalidateQueries, [
      'agent-platform',
      'kagent',
      'session',
      'gazelle',
      'abc',
    ]);
    expect(filters).toBeDefined();
    expect(filters).not.toMatchObject({ refetchType: 'none' });
  });

  it('refreshes the sessions list, which shows the title in a column', async () => {
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current.renameSession('New name');
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

  it('leaves the tasks read alone', async () => {
    // A rename touches no task, and that query polls on the faster tier anyway.
    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await result.current.renameSession('New name');
    });

    expect(
      invalidationFor(invalidateQueries, [
        'agent-platform',
        'kagent',
        'session-tasks',
        'gazelle',
        'abc',
      ]),
    ).toBeUndefined();
  });

  it('reports a failure and rejects, leaving the caller to decide', async () => {
    renameSession.mockRejectedValue(new Error('kagent said no'));

    const { result } = renderWith();

    await act(async () => {
      await expect(result.current.renameSession('New name')).rejects.toThrow(
        'kagent said no',
      );
    });

    await waitFor(() =>
      expect(result.current.error?.message).toBe('kagent said no'),
    );
  });

  it('does not refresh anything when the rename failed', async () => {
    // A refetch here would be worse than useless: it would redraw the old title
    // under a dialog that is still showing why the new one did not take.
    renameSession.mockRejectedValue(new Error('kagent said no'));

    const { result, invalidateQueries } = renderWith();

    await act(async () => {
      await expect(result.current.renameSession('New name')).rejects.toThrow();
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('clears a previous failure on reset, so a reopened dialog is clean', async () => {
    renameSession.mockRejectedValue(new Error('kagent said no'));

    const { result } = renderWith();

    await act(async () => {
      await expect(result.current.renameSession('New name')).rejects.toThrow();
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
