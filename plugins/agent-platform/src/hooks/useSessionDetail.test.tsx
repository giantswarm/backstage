import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { KagentApi } from '../apis/types';
import { useSessionDetail } from './useSessionDetail';

const getSessionDetail = jest.fn();
const listSessionTasks = jest.fn();

const kagentApi = {
  getSessionDetail,
  listSessionTasks,
} as unknown as KagentApi;

function notFoundError() {
  const error = new Error('session not found');
  error.name = 'NotFoundError';
  return error;
}

/** A tasks read that never settles, standing in for a slow installation. */
function neverSettles() {
  return new Promise(() => {});
}

function renderWith() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kagentApiRef, kagentApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useSessionDetail('gazelle', 'abc'), { wrapper });
}

beforeEach(() => {
  getSessionDetail.mockReset();
  listSessionTasks.mockReset();
});

describe('useSessionDetail', () => {
  it('reports not found when kagent has no such session', async () => {
    // 404 covers deleted, never-existed and belongs-to-someone-else alike.
    getSessionDetail.mockRejectedValue(notFoundError());
    listSessionTasks.mockRejectedValue(notFoundError());

    const { result } = renderWith();

    await waitFor(() => expect(result.current.isNotFound).toBe(true));
    // An expected outcome, not something to report as a read failure.
    expect(result.current.error).toBeUndefined();
  });

  it('stops loading as soon as the session is known to be missing', async () => {
    // The session read decides "not found" on its own, and the page checks
    // `isLoading` first — so leaving loading true until the *tasks* read settles
    // kept the user on a spinner for the whole retry ladder, or for the fetch
    // timeout on an unreachable installation, with the answer already known.
    getSessionDetail.mockRejectedValue(notFoundError());
    listSessionTasks.mockImplementation(neverSettles);

    const { result } = renderWith();

    await waitFor(() => expect(result.current.isNotFound).toBe(true));
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps loading while a readable session’s tasks are still in flight', async () => {
    // The other side of that short-circuit: with the session present there is
    // nothing to show until its conversation arrives.
    getSessionDetail.mockResolvedValue({
      session: {
        id: 'gazelle/abc',
        sessionId: 'abc',
        installation: 'gazelle',
        title: 'Chat',
      },
    });
    listSessionTasks.mockImplementation(neverSettles);

    const { result } = renderWith();

    await waitFor(() => expect(getSessionDetail).toHaveBeenCalled());
    expect(result.current.isNotFound).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });
});
