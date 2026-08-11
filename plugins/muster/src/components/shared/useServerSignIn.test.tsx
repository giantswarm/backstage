import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import {
  AuthStatusResponse,
  MusterApi,
  musterApiRef,
  ServerSignInResult,
} from '../../apis';
import { useServerSignIn } from './useServerSignIn';

const AUTH_URL =
  'https://muster.gazelle.example.io/oauth/proxy/start?state=abc';

const CHALLENGE: ServerSignInResult = {
  status: 'auth_required',
  authUrl: AUTH_URL,
  message: `Please sign in to connect to this server:\n\n${AUTH_URL}`,
};

type Api = Pick<MusterApi, 'getAuthStatus' | 'signInServer'>;

function makeApi(initial: AuthStatusResponse): jest.Mocked<Api> {
  return {
    getAuthStatus: jest.fn(() => Promise.resolve(initial)),
    signInServer: jest.fn((_server: string, _installation?: string) =>
      Promise.resolve(CHALLENGE),
    ),
  };
}

function wrapper(api: Api, queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
}

function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe('useServerSignIn', () => {
  /**
   * The completion signal. Driven with an injected poll interval so it runs in
   * milliseconds -- the real 5 s tick made this a flake risk on loaded CI
   * workers, where a false failure reads as "completion detection is broken".
   */
  it('ends the wait when auth://status reports the server connected', async () => {
    const api = makeApi({
      servers: [{ name: 'pro', status: 'auth_required' }],
    });
    const queryClient = newQueryClient();
    const { result } = renderHook(
      () => useServerSignIn('pro', 'gazelle', { pollIntervalMs: 20 }),
      { wrapper: wrapper(api, queryClient) },
    );

    await waitFor(() => expect(result.current.needsLogin).toBe(true));

    await act(async () => result.current.signIn());
    await waitFor(() => expect(result.current.authUrl).toBe(AUTH_URL));
    expect(result.current.isWaiting).toBe(true);

    // The browser flow completes: the next poll sees it connected.
    api.getAuthStatus.mockResolvedValue({
      servers: [{ name: 'pro', status: 'connected' }],
    });

    await waitFor(() => expect(result.current.authUrl).toBeUndefined());
    expect(result.current.isWaiting).toBe(false);
  });

  /**
   * Anything other than `connected` means the flow hasn't landed -- dropping the
   * link on a transient `disconnected` would strand the user with no affordance.
   */
  it('keeps waiting while the status is not connected', async () => {
    const api = makeApi({
      servers: [{ name: 'pro', status: 'auth_required' }],
    });
    const queryClient = newQueryClient();
    const { result } = renderHook(
      () => useServerSignIn('pro', 'gazelle', { pollIntervalMs: 20 }),
      { wrapper: wrapper(api, queryClient) },
    );

    await waitFor(() => expect(result.current.needsLogin).toBe(true));
    await act(async () => result.current.signIn());
    await waitFor(() => expect(result.current.authUrl).toBe(AUTH_URL));

    api.getAuthStatus.mockResolvedValue({
      servers: [{ name: 'pro', status: 'disconnected' }],
    });

    // Give the poll several ticks to (wrongly) clear the pending sign-in.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 120));
    });
    expect(result.current.authUrl).toBe(AUTH_URL);
  });

  /**
   * On the MCP servers page the affordance lives inside a DisclosureAccordion,
   * which unmounts its children when collapsed. The pending sign-in is held in
   * the query cache so collapsing the row mid-flow does not silently cancel a
   * sign-in that then succeeds.
   */
  it('resumes a pending sign-in after the row is unmounted and remounted', async () => {
    const api = makeApi({
      servers: [{ name: 'pro', status: 'auth_required' }],
    });
    const queryClient = newQueryClient();
    const options = { wrapper: wrapper(api, queryClient) };

    const first = renderHook(() => useServerSignIn('pro', 'gazelle'), options);
    await waitFor(() => expect(first.result.current.needsLogin).toBe(true));
    await act(async () => first.result.current.signIn());
    await waitFor(() => expect(first.result.current.authUrl).toBe(AUTH_URL));

    first.unmount();

    const second = renderHook(() => useServerSignIn('pro', 'gazelle'), options);
    await waitFor(() => expect(second.result.current.authUrl).toBe(AUTH_URL));
    expect(second.result.current.isWaiting).toBe(true);
    // The remounted row picks up the same flow rather than starting a new one.
    expect(api.signInServer).toHaveBeenCalledTimes(1);
  });

  /** The pending entry is per server, so one flow cannot leak into another row. */
  it('keeps pending sign-ins separate per server', async () => {
    const api = makeApi({
      servers: [
        { name: 'pro', status: 'auth_required' },
        { name: 'other', status: 'auth_required' },
      ],
    });
    const queryClient = newQueryClient();
    const options = { wrapper: wrapper(api, queryClient) };

    const pro = renderHook(() => useServerSignIn('pro', 'gazelle'), options);
    await waitFor(() => expect(pro.result.current.needsLogin).toBe(true));
    await act(async () => pro.result.current.signIn());
    await waitFor(() => expect(pro.result.current.authUrl).toBe(AUTH_URL));

    const other = renderHook(
      () => useServerSignIn('other', 'gazelle'),
      options,
    );
    await waitFor(() => expect(other.result.current.needsLogin).toBe(true));
    expect(other.result.current.authUrl).toBeUndefined();
  });

  /**
   * The deadline CLEARS the entry rather than marking it timed out. Keeping it
   * would leave the row visible with polling stopped and nothing able to re-read
   * status (the muster QueryClient has refetchOnWindowFocus off), so a user who
   * finished the IdP round-trip just after the deadline would be stuck looking at
   * stale state.
   */
  it('clears a pending sign-in at the deadline so the row can act again', async () => {
    const api = makeApi({
      servers: [{ name: 'pro', status: 'auth_required' }],
    });
    const queryClient = newQueryClient();
    const { result } = renderHook(
      () =>
        useServerSignIn('pro', 'gazelle', {
          pollIntervalMs: 20,
          // Long enough that `authUrl` is still observable below: the deadline
          // clears it, so a window measured in tens of milliseconds can elapse
          // before the first `waitFor` poll on a loaded CI worker.
          timeoutMs: 750,
        }),
      { wrapper: wrapper(api, queryClient) },
    );

    await waitFor(() => expect(result.current.needsLogin).toBe(true));
    await act(async () => result.current.signIn());
    await waitFor(() => expect(result.current.authUrl).toBe(AUTH_URL));

    await waitFor(() => expect(result.current.authUrl).toBeUndefined(), {
      timeout: 3_000,
    });
    expect(result.current.isWaiting).toBe(false);
    // Nothing left in the cache pinning the row open.
    expect(
      queryClient.getQueryData(['muster', 'pending-sign-in', 'gazelle', 'pro']),
    ).toBeNull();
  });
});
