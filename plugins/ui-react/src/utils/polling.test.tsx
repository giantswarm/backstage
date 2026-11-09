import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { isPermanentReadError, pollingQueryOptions } from './polling';

const INTERVAL_MS = 10_000;

/** A 401 of muster-backend, as the muster plugin's client throws it. */
function signInRequired() {
  return Object.assign(new Error('sign in to model-manager'), {
    name: 'UnauthorizedError',
    status: 401,
    reason: 'server_sign_in_required',
    server: 'model-manager',
  });
}

/** A plugin's own error, keeping muster's as the cause. */
function wrapped(cause: Error) {
  const error = new Error('model-manager is not connected', { cause });
  error.name = 'ModelManagerNotConnectedError';
  return error;
}

function renderPoll(queryFn: () => Promise<string>) {
  const queryClient = new QueryClient({
    // As the portal's clients: no retries here, nothing on focus by default.
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () =>
      useQuery({
        queryKey: ['poll'],
        queryFn,
        staleTime: INTERVAL_MS,
        ...pollingQueryOptions(INTERVAL_MS),
      }),
    { wrapper },
  );
  return { ...view, queryClient };
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe('isPermanentReadError', () => {
  it.each([
    ['muster asking for a sign-in (401)', signInRequired()],
    ['a 401 kept as the cause', wrapped(signInRequired())],
    [
      'a 403 by name',
      Object.assign(new Error('no'), { name: 'ForbiddenError' }),
    ],
    ['a 403 by status', Object.assign(new Error('no'), { status: 403 })],
    [
      "a Backstage backend's 401",
      Object.assign(new Error('no'), { name: 'AuthenticationError' }),
    ],
    [
      "a Backstage backend's 403",
      Object.assign(new Error('no'), { name: 'NotAllowedError' }),
    ],
    [
      'a server the session is not connected to',
      Object.assign(new Error('no'), {
        name: 'MusterServerNotConnectedError',
      }),
    ],
  ])('is true for %s', (_, error) => {
    expect(isPermanentReadError(error)).toBe(true);
  });

  it.each([
    ['a timeout', new Error('timed out')],
    ['a 404', Object.assign(new Error('gone'), { name: 'NotFoundError' })],
    ['a 503', Object.assign(new Error('down'), { status: 503 })],
    // The words alone say nothing: only the structured error counts.
    ['a message that reads like one', new Error('401 Unauthorized')],
    ['nothing', undefined],
  ])('is false for %s', (_, error) => {
    expect(isPermanentReadError(error)).toBe(false);
  });
});

describe('pollingQueryOptions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    focusManager.setFocused(undefined);
    jest.useRealTimers();
  });

  it('polls at the interval while the tab is visible', async () => {
    const queryFn = jest.fn(async () => 'answer');
    renderPoll(queryFn);
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

    await advance(3 * INTERVAL_MS);

    expect(queryFn).toHaveBeenCalledTimes(4);
  });

  it('stops polling once the last read asked for a sign-in, and resumes after it', async () => {
    let connected = false;
    const queryFn = jest.fn(async () => {
      if (!connected) {
        throw wrapped(signInRequired());
      }
      return 'answer';
    });
    const { result, queryClient } = renderPoll(queryFn);
    await waitFor(() => expect(result.current.isError).toBe(true));

    await advance(10 * INTERVAL_MS);
    // One call, not one per interval.
    expect(queryFn).toHaveBeenCalledTimes(1);

    // The person signs in; the page reads the query again.
    connected = true;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['poll'] });
    });
    await waitFor(() => expect(result.current.data).toBe('answer'));
    expect(queryFn).toHaveBeenCalledTimes(2);

    await advance(2 * INTERVAL_MS);
    expect(queryFn).toHaveBeenCalledTimes(4);
  });

  it('keeps polling after an error that may pass', async () => {
    const queryFn = jest.fn(async () => {
      throw new Error('timed out');
    });
    const { result } = renderPoll(queryFn);
    await waitFor(() => expect(result.current.isError).toBe(true));

    await advance(2 * INTERVAL_MS);

    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it('does not poll from a hidden tab, and reads again as it becomes visible', async () => {
    const queryFn = jest.fn(async () => 'answer');
    renderPoll(queryFn);
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

    act(() => focusManager.setFocused(false));
    await advance(10 * INTERVAL_MS);
    expect(queryFn).toHaveBeenCalledTimes(1);

    // Back in front, with data older than its stale time: read at once,
    // not at the next tick.
    act(() => focusManager.setFocused(true));
    await advance(0);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('reads a query stopped on a sign-in again as the tab becomes visible', async () => {
    // The sign-in may have landed in another tab meanwhile.
    let connected = false;
    const queryFn = jest.fn(async () => {
      if (!connected) {
        throw signInRequired();
      }
      return 'answer';
    });
    const { result } = renderPoll(queryFn);
    await waitFor(() => expect(result.current.isError).toBe(true));

    act(() => focusManager.setFocused(false));
    connected = true;
    act(() => focusManager.setFocused(true));
    await waitFor(() => expect(result.current.data).toBe('answer'));
    expect(queryFn).toHaveBeenCalledTimes(2);

    await advance(INTERVAL_MS);
    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it('keeps the interval a function of the query', () => {
    const { refetchInterval } = pollingQueryOptions<{
      state: { status: string; error: Error | null; data?: number };
    }>(query => ((query.state.data ?? 0) > 1 ? 1_000 : false));

    expect(
      refetchInterval({ state: { status: 'success', error: null, data: 2 } }),
    ).toBe(1_000);
    expect(
      refetchInterval({ state: { status: 'success', error: null, data: 0 } }),
    ).toBe(false);
    expect(
      refetchInterval({
        state: { status: 'error', error: signInRequired(), data: 2 },
      }),
    ).toBe(false);
  });
});
