import type { ReactNode } from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  AuthStatusResponse,
  MusterApi,
  musterApiRef,
  ServerAuthStatus,
  sessionExpiredError,
} from '../../apis';
import { McpSignInProvider, useMcpSignIn } from './McpSignInProvider';
import { CONNECTING_POLL_INTERVAL_MS } from '../shared/useServerSignIn';
import type { SignInInstallation } from './useSignInInstallation';
import { SETTLE_REREAD_MS, SETTLE_WINDOW_MS } from './hooks/useSettledWaiting';
import { MCPServer } from '../../lib/k8s';

/** The installation's MCPServers, per test; none by default. */
let mockServers: MCPServer[] = [];
/** The options of each read of the MCPServers, in render order. */
const mockServerReadOptions: Array<Record<string, unknown>> = [];
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (
    _installations: string[],
    _kind: unknown,
    _query: unknown,
    options: Record<string, unknown>,
  ) => ({
    resources: (mockServerReadOptions.push(options), mockServers),
    errors: [],
    queries: [],
    isLoading: false,
    retry: jest.fn(),
  }),
}));

// The plugin's own client is a module singleton; each test brings a fresh
// one around the provider instead.
jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

let mockInstallation: SignInInstallation = {
  installation: 'graveler',
  isLoading: false,
};
jest.mock('./useSignInInstallation', () => ({
  useSignInInstallation: () => mockInstallation,
}));

function annotated(name: string, displayName: string): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name,
        annotations: { 'ui.giantswarm.io/display-name': displayName },
      },
      spec: {},
    } as never,
    'graveler',
  );
}

// The waiting servers settle on a second read a few seconds after the first.
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  mockServers = [];
  mockServerReadOptions.length = 0;
  mockInstallation = { installation: 'graveler', isLoading: false };
});

type Api = Pick<MusterApi, 'getAuthStatus' | 'signInServer' | 'signOutServer'>;

const waitingFor = (name: string): ServerAuthStatus => ({
  name,
  status: 'auth_required',
  auth_tool: 'core_auth_login',
});
const sso = (name: string): ServerAuthStatus => ({
  name,
  status: 'connected',
  token_forwarding_enabled: true,
});

function makeApi(response: AuthStatusResponse): jest.Mocked<Api> {
  return {
    // A fresh object per read, as the wire gives: the tests change `response`.
    getAuthStatus: jest.fn(() => Promise.resolve({ ...response })),
    signInServer: jest.fn(),
    signOutServer: jest.fn(),
  };
}

/** What a consumer of the status sees, as text. */
function Status() {
  const signIn = useMcpSignIn();
  if (!signIn) {
    return <p>no provider</p>;
  }
  return (
    <>
      <p data-testid="status">
        {JSON.stringify({
          installation: signIn.installation ?? null,
          waiting: signIn.waiting,
          connected: signIn.connected,
          isRead: signIn.isRead,
          isAvailable: signIn.isAvailable,
        })}
      </p>
      <button onClick={signIn.openSignIn}>Open sign-in</button>
    </>
  );
}

function status() {
  return JSON.parse(screen.getByTestId('status').textContent!);
}

/** The re-read a few seconds later, and react-query's notice of its answer. */
async function reread() {
  await act(() => jest.advanceTimersByTimeAsync(SETTLE_REREAD_MS));
  await act(() => jest.advanceTimersByTimeAsync(10));
}

/** The first read, then the re-read a few seconds later that settles it. */
async function settle() {
  await waitFor(() => expect(status().isRead).toBe(true));
  await reread();
}

function user() {
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

async function renderProvider(api: Api) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <McpSignInProvider>
          <Status />
        </McpSignInProvider>
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return queryClient;
}

describe('McpSignInProvider', () => {
  it('gives the servers of the home installation that wait for the sign-in, not the SSO ones', async () => {
    const api = makeApi({
      servers: [
        waitingFor('workspace-manager'),
        sso('mcp-kubernetes'),
        { ...waitingFor('cluster-manager'), status: 'reauth_required' },
      ],
    });
    await renderProvider(api);
    await settle();

    await waitFor(() =>
      expect(status()).toEqual({
        installation: 'graveler',
        waiting: [
          { name: 'cluster-manager', label: 'cluster-manager' },
          { name: 'workspace-manager', label: 'workspace-manager' },
        ],
        connected: ['mcp-kubernetes'],
        isRead: true,
        isAvailable: true,
      }),
    );
    expect(api.getAuthStatus).toHaveBeenCalledWith('graveler');
  });

  it.each([
    [
      'refused the sign-in',
      {
        status: 'reauth_required',
        token_forwarding_enabled: true,
        sso_attempt_failed: true,
      },
    ],
    [
      'is not connected yet',
      { status: 'auth_required', token_exchange_enabled: true },
    ],
    ['says so by its kind alone', { status: 'auth_required', kind: 'sso' }],
  ] as const)(
    'never counts an SSO server as waiting, one that %s included',
    async (_, entry) => {
      const api = makeApi({
        servers: [
          waitingFor('workspace-manager'),
          { name: 'devctl', ...entry },
        ],
      });
      await renderProvider(api);
      await settle();

      await waitFor(() =>
        expect(status()).toEqual(
          expect.objectContaining({
            isRead: true,
            waiting: [
              { name: 'workspace-manager', label: 'workspace-manager' },
            ],
          }),
        ),
      );
    },
  );

  describe('on a fresh portal load', () => {
    const pending = (name: string): ServerAuthStatus => ({
      name,
      status: 'sso_pending',
      token_forwarding_enabled: true,
    });

    /** muster's answers, one per read; the last one repeats. */
    function readsOf(...answers: AuthStatusResponse[]) {
      const api = makeApi({ servers: [] });
      api.getAuthStatus.mockImplementation(() =>
        Promise.resolve(answers.length > 1 ? answers.shift()! : answers[0]),
      );
      return api;
    }

    it('raises nothing while muster is still connecting the session, nor once it has', async () => {
      // The session's start: its SSO servers connecting, a subject-scoped
      // grant not adopted yet.
      const api = readsOf(
        {
          servers: [
            waitingFor('workspace-manager'),
            pending('mcp-kubernetes'),
            pending('mcp-prometheus'),
          ],
        },
        {
          servers: [
            { ...waitingFor('workspace-manager'), status: 'connected' },
            sso('mcp-kubernetes'),
            sso('mcp-prometheus'),
          ],
        },
      );
      await renderProvider(api);

      await waitFor(() => expect(status().isRead).toBe(true));
      expect(status().waiting).toEqual([]);
      await settle();
      expect(api.getAuthStatus).toHaveBeenCalledTimes(2);
      expect(status()).toEqual(
        expect.objectContaining({
          waiting: [],
          connected: ['mcp-kubernetes', 'mcp-prometheus', 'workspace-manager'],
        }),
      );
    });

    it('raises nothing for a server that waits on one read and is connected on the next', async () => {
      const api = readsOf(
        { servers: [waitingFor('workspace-manager')] },
        {
          servers: [
            { ...waitingFor('workspace-manager'), status: 'connected' },
          ],
        },
      );
      await renderProvider(api);

      await waitFor(() => expect(status().isRead).toBe(true));
      expect(status().waiting).toEqual([]);
      await settle();
      expect(status().connected).toEqual(['workspace-manager']);
      expect(status().waiting).toEqual([]);
    });

    it('raises a server once a read a few seconds later still has it waiting', async () => {
      const api = readsOf({ servers: [waitingFor('workspace-manager')] });
      await renderProvider(api);

      await waitFor(() => expect(status().isRead).toBe(true));
      expect(status().waiting).toEqual([]);
      await settle();
      expect(status().waiting).toEqual([
        { name: 'workspace-manager', label: 'workspace-manager' },
      ]);
    });

    it('raises the waiting servers a few seconds after muster finished connecting, when the reads agree', async () => {
      const api = readsOf(
        {
          servers: [waitingFor('workspace-manager'), pending('mcp-kubernetes')],
        },
        { servers: [waitingFor('workspace-manager'), sso('mcp-kubernetes')] },
      );
      await renderProvider(api);

      await waitFor(() => expect(status().isRead).toBe(true));
      // Held back while muster is connecting; its 2 s re-read, which finds
      // it done, is too close to the first to confirm.
      expect(status().waiting).toEqual([]);
      await reread();
      expect(status().connected).toEqual(['mcp-kubernetes']);
      expect(status().waiting).toEqual([]);
      // The settling's own re-read, a few seconds later, confirms it.
      await reread();
      expect(status().waiting).toEqual([
        { name: 'workspace-manager', label: 'workspace-manager' },
      ]);
    });

    it('raises a waiting server within about a minute while muster keeps a server connecting', async () => {
      const api = readsOf({
        servers: [waitingFor('workspace-manager'), pending('mcp-kubernetes')],
      });
      await renderProvider(api);
      await waitFor(() => expect(status().isRead).toBe(true));

      // The window's re-reads, every few seconds, hold it back.
      for (let i = 0; i < SETTLE_WINDOW_MS / SETTLE_REREAD_MS - 1; i++) {
        await reread();
        expect(status().waiting).toEqual([]);
      }
      // The read that ends the window raises it, not the 5-minute one.
      await reread();
      expect(status().waiting).toEqual([
        { name: 'workspace-manager', label: 'workspace-manager' },
      ]);
    });

    it('reads every 2 s while muster is connecting, with no second timer, and raises nothing meanwhile', async () => {
      const api = readsOf({
        servers: [waitingFor('workspace-manager'), pending('mcp-kubernetes')],
      });
      await renderProvider(api);
      await waitFor(() => expect(status().isRead).toBe(true));
      const first = api.getAuthStatus.mock.calls.length;

      await act(() =>
        jest.advanceTimersByTimeAsync(5 * CONNECTING_POLL_INTERVAL_MS),
      );
      await act(() => jest.advanceTimersByTimeAsync(10));
      expect(api.getAuthStatus.mock.calls.length - first).toBe(5);
      expect(status().waiting).toEqual([]);
    });

    it('stops re-reading quickly while the reads fail', async () => {
      const api = readsOf({ servers: [waitingFor('workspace-manager')] });
      await renderProvider(api);
      await waitFor(() => expect(status().isRead).toBe(true));
      api.getAuthStatus.mockRejectedValue(new Error('502 Bad Gateway'));

      await reread();
      const reads = api.getAuthStatus.mock.calls.length;
      for (let i = 0; i < 6; i++) {
        await reread();
      }
      expect(api.getAuthStatus).toHaveBeenCalledTimes(reads);
    });

    it('stops re-reading quickly once the portal session is gone', async () => {
      const api = readsOf({ servers: [waitingFor('workspace-manager')] });
      await renderProvider(api);
      await waitFor(() => expect(status().isRead).toBe(true));
      api.getAuthStatus.mockRejectedValue(sessionExpiredError('graveler'));

      await reread();
      const reads = api.getAuthStatus.mock.calls.length;
      for (let i = 0; i < 6; i++) {
        await reread();
      }
      expect(api.getAuthStatus).toHaveBeenCalledTimes(reads);
    });
  });

  it('is not read until muster answers', async () => {
    const api = makeApi({ servers: [] });
    api.getAuthStatus.mockReturnValue(new Promise(() => {}));
    await renderProvider(api);

    expect(status()).toEqual(
      expect.objectContaining({ isRead: false, isAvailable: false }),
    );
  });

  it('names a server by its display name', async () => {
    mockServers = [annotated('workspace-manager', 'Workspaces')];
    await renderProvider(
      makeApi({ servers: [waitingFor('workspace-manager')] }),
    );
    await settle();

    await waitFor(() =>
      expect(status().waiting).toEqual([
        { name: 'workspace-manager', label: 'Workspaces' },
      ]),
    );
  });

  it('keeps a display name that holds a newline or a tab whole', async () => {
    mockServers = [annotated('workspace-manager', 'Work\tspaces\n')];
    await renderProvider(
      makeApi({ servers: [waitingFor('workspace-manager')] }),
    );
    await settle();

    await waitFor(() =>
      expect(status().waiting).toEqual([
        // One server, not a phantom second; the display name is trimmed.
        { name: 'workspace-manager', label: 'Work\tspaces' },
      ]),
    );
  });

  it('says it cannot tell when muster cannot say', async () => {
    const api = makeApi({
      servers: [waitingFor('workspace-manager')],
      unavailable: true,
    });
    await renderProvider(api);

    await waitFor(() =>
      expect(status()).toEqual(
        expect.objectContaining({
          waiting: [],
          isRead: true,
          isAvailable: false,
        }),
      ),
    );
  });

  it('has nothing to read without a reachable home installation, once that is known', async () => {
    mockInstallation = { installation: undefined, isLoading: true };
    const api = makeApi({ servers: [waitingFor('workspace-manager')] });
    const { rerender } = await renderInTestApp(
      <TestApiProvider apis={[[musterApiRef, api]]}>
        <QueryClientProvider client={new QueryClient()}>
          <McpSignInProvider>
            <Status />
          </McpSignInProvider>
        </QueryClientProvider>
      </TestApiProvider>,
    );
    expect(status().isRead).toBe(false);

    mockInstallation = { installation: undefined, isLoading: false };
    rerender(
      <TestApiProvider apis={[[musterApiRef, api]]}>
        <QueryClientProvider client={new QueryClient()}>
          <McpSignInProvider>
            <Status />
          </McpSignInProvider>
        </QueryClientProvider>
      </TestApiProvider>,
    );
    await waitFor(() =>
      expect(status()).toEqual({
        installation: null,
        waiting: [],
        connected: [],
        isRead: true,
        isAvailable: false,
      }),
    );
    expect(api.getAuthStatus).not.toHaveBeenCalled();
  });

  it('drops a server once it is signed in to, through the same read', async () => {
    const response: AuthStatusResponse = {
      servers: [waitingFor('workspace-manager'), waitingFor('cluster-manager')],
    };
    const queryClient = await renderProvider(makeApi(response));
    await settle();
    await waitFor(() => expect(status().waiting).toHaveLength(2));

    // A sign-in on a muster page invalidates the shared status read.
    response.servers = [
      waitingFor('workspace-manager'),
      sso('cluster-manager'),
    ];
    await queryClient.invalidateQueries({ queryKey: ['muster'] });
    await waitFor(() =>
      expect(status().waiting).toEqual([
        { name: 'workspace-manager', label: 'workspace-manager' },
      ]),
    );
  });

  it('opens the sign-in dialog with a row per waiting server', async () => {
    await renderProvider(
      makeApi({
        servers: [waitingFor('workspace-manager'), sso('mcp-kubernetes')],
      }),
    );
    await settle();
    await waitFor(() => expect(status().waiting).toHaveLength(1));

    await user().click(screen.getByRole('button', { name: 'Open sign-in' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Sign in to MCP servers');
    expect(dialog).toHaveTextContent('workspace-manager');
    expect(dialog).toHaveTextContent(
      '1 more server comes with your portal sign-in.',
    );
  });

  it('opens no dialog without a home installation to sign in to', async () => {
    mockInstallation = { installation: undefined, isLoading: false };
    const api = makeApi({ servers: [waitingFor('workspace-manager')] });
    await renderProvider(api);
    await waitFor(() => expect(status().isRead).toBe(true));

    await user().click(screen.getByRole('button', { name: 'Open sign-in' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.getAuthStatus).not.toHaveBeenCalled();
  });

  it('reads the display names once, and not while the portal session is gone', async () => {
    const api = makeApi({ servers: [waitingFor('workspace-manager')] });
    const queryClient = await renderProvider(api);
    await settle();
    await waitFor(() => expect(status().waiting).toHaveLength(1));
    // No discovery and no refetch of its own that could ask for the cluster
    // token in the background.
    expect(mockServerReadOptions.at(-1)).toEqual({
      enabled: true,
      enableDiscovery: false,
      staleTime: Infinity,
    });

    api.getAuthStatus.mockRejectedValue(sessionExpiredError('graveler'));
    await queryClient.refetchQueries({ queryKey: ['muster'] });
    await waitFor(() =>
      expect(mockServerReadOptions.at(-1)).toMatchObject({ enabled: false }),
    );
    // What was read before the session expired is no answer now.
    expect(status().isAvailable).toBe(false);
  });

  it('has nothing waiting once the portal session has expired', async () => {
    const api = makeApi({ servers: [] });
    api.getAuthStatus.mockRejectedValue(sessionExpiredError('graveler'));
    await renderProvider(api);

    await waitFor(() =>
      expect(status()).toEqual(
        expect.objectContaining({
          waiting: [],
          isRead: true,
          isAvailable: false,
        }),
      ),
    );
  });

  it('leaves nothing outside a provider', async () => {
    await renderInTestApp(<Status />);
    expect(screen.getByText('no provider')).toBeInTheDocument();
  });
});
