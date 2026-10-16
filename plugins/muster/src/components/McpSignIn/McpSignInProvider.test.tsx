import type { ReactNode } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  AuthStatusResponse,
  MusterApi,
  musterApiRef,
  ServerAuthStatus,
} from '../../apis';
import { McpSignInProvider, useMcpSignIn } from './McpSignInProvider';
import type { SignInInstallation } from './useSignInInstallation';
import { MCPServer } from '../../lib/k8s';

/** The installation's MCPServers, per test; none by default. */
let mockServers: MCPServer[] = [];
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: () => ({
    resources: mockServers,
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

afterEach(() => {
  mockServers = [];
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

    await waitFor(() =>
      expect(status()).toEqual({
        installation: 'graveler',
        waiting: [
          { name: 'cluster-manager', label: 'cluster-manager' },
          { name: 'workspace-manager', label: 'workspace-manager' },
        ],
        isRead: true,
        isAvailable: true,
      }),
    );
    expect(api.getAuthStatus).toHaveBeenCalledWith('graveler');
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

    await waitFor(() =>
      expect(status().waiting).toEqual([
        { name: 'workspace-manager', label: 'Workspaces' },
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
    await waitFor(() => expect(status().waiting).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: 'Open sign-in' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Sign in to MCP servers');
    expect(dialog).toHaveTextContent('workspace-manager');
    expect(dialog).toHaveTextContent(
      '1 more server comes with your portal sign-in.',
    );
  });

  it('leaves nothing outside a provider', async () => {
    await renderInTestApp(<Status />);
    expect(screen.getByText('no provider')).toBeInTheDocument();
  });
});
