import { screen, waitFor } from '@testing-library/react';
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
import {
  HIDDEN_NOTICE_STORAGE_KEY,
  McpAuthNoticeContent,
} from './McpAuthNotice';
import { MCPServer } from '../../lib/k8s';

/** The installation's MCPServers, per test; none by default. */
let mockServers: MCPServer[] = [];
/** Whether each read of the MCPServers was enabled, in render order. */
const mockServerReads: boolean[] = [];
const mockServerReadOptions: object[] = [];
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (
    _clusters: unknown,
    _kind: unknown,
    _options: unknown,
    queryOptions: {
      enabled?: boolean;
      enableDiscovery?: boolean;
      staleTime?: number;
    } = {},
  ) => {
    mockServerReads.push(queryOptions.enabled ?? true);
    mockServerReadOptions.push(queryOptions);
    return {
      resources: mockServers,
      errors: [],
      queries: [],
      isLoading: false,
      retry: jest.fn(),
    };
  },
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
  mockServerReads.length = 0;
  mockServerReadOptions.length = 0;
});

jest.mock('./useNoticeInstallation', () => ({
  useNoticeInstallation: () => 'graveler',
}));

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

async function renderNotice(api: Api) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <McpAuthNoticeContent />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('McpAuthNotice', () => {
  it('names the servers that wait for the sign-in, not the SSO ones', async () => {
    const api = makeApi({
      servers: [
        waitingFor('workspace-manager'),
        sso('mcp-kubernetes'),
        waitingFor('cluster-manager'),
      ],
    });
    await renderNotice(api);

    expect(
      await screen.findByText('2 MCP servers need your sign-in'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cluster-manager, workspace-manager\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/mcp-kubernetes/)).not.toBeInTheDocument();
    expect(api.getAuthStatus).toHaveBeenCalledWith('graveler');
  });

  it('stands clear of what is docked at the bottom: the wizard footer, the composer and the mobile bar', async () => {
    await renderNotice(makeApi({ servers: [waitingFor('workspace-manager')] }));
    await screen.findByText('1 MCP server needs your sign-in');

    const styles = Array.from(document.querySelectorAll('style'))
      .map(style => style.textContent)
      .join('\n');
    expect(styles).toContain(
      'bottom: calc(var(--mcp-auth-notice-gap) + var(--agent-shell-mobile-bar-height, 0px) + var(--wizard-footer-height, 0px) + var(--session-dock-height, 0px))',
    );
  });

  it('has the page reserve the room it covers while it is shown, and gives it back when hidden', async () => {
    const clearance = () =>
      document.documentElement.style.getPropertyValue(
        '--floating-notice-clearance',
      );
    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height: 120 } as DOMRect);
    try {
      await renderNotice(
        makeApi({ servers: [waitingFor('workspace-manager')] }),
      );
      await screen.findByText('1 MCP server needs your sign-in');
      expect(parseFloat(clearance())).toBeGreaterThanOrEqual(120);

      await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
      expect(clearance()).toBe('');
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('stops reading the server names once the portal session has expired', async () => {
    // The names come from the installation's MCPServers through the cluster
    // token, which a person with no session would be asked to sign in for.
    const response: AuthStatusResponse = {
      servers: [waitingFor('workspace-manager')],
    };
    const api = makeApi(response);
    const queryClient = await renderNotice(api);
    await screen.findByText('1 MCP server needs your sign-in');
    expect(mockServerReads).toContain(true);
    // Read once: no discovery and no refetch of its own that could ask for
    // the cluster token in the background.
    expect(mockServerReadOptions.at(-1)).toMatchObject({
      enableDiscovery: false,
      staleTime: Infinity,
    });

    mockServerReads.length = 0;
    api.getAuthStatus.mockRejectedValue(sessionExpiredError('graveler'));
    await queryClient.refetchQueries({ queryKey: ['muster'] });
    await waitFor(() => expect(mockServerReads.length).toBeGreaterThan(0));
    expect(mockServerReads).not.toContain(true);
  });

  it('shows nothing, and reserves nothing, once the portal session has expired', async () => {
    const api = makeApi({ servers: [] });
    api.getAuthStatus.mockRejectedValue(sessionExpiredError('graveler'));
    await renderNotice(api);
    await waitFor(() => expect(api.getAuthStatus).toHaveBeenCalled());

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(
      document.documentElement.style.getPropertyValue(
        '--floating-notice-clearance',
      ),
    ).toBe('');
  });

  it('names a server by its display name', async () => {
    mockServers = [annotated('workspace-manager', 'Workspaces')];
    await renderNotice(makeApi({ servers: [waitingFor('workspace-manager')] }));

    expect(await screen.findByText(/in: Workspaces\./)).toBeInTheDocument();
  });

  it('shortens a long list to three names and a count', async () => {
    await renderNotice(
      makeApi({
        servers: ['a', 'b', 'c', 'd', 'e'].map(waitingFor),
      }),
    );
    expect(await screen.findByText(/a, b, c and 2 more\./)).toBeInTheDocument();
  });

  it('shows nothing while every server is connected', async () => {
    const api = makeApi({ servers: [sso('mcp-kubernetes')] });
    await renderNotice(api);
    await waitFor(() => expect(api.getAuthStatus).toHaveBeenCalled());
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('shows nothing when muster cannot say', async () => {
    const api = makeApi({
      servers: [waitingFor('workspace-manager')],
      unavailable: true,
    });
    await renderNotice(api);
    await waitFor(() => expect(api.getAuthStatus).toHaveBeenCalled());
    expect(screen.queryByText(/need your sign-in/)).not.toBeInTheDocument();
  });

  it('hides for the servers it named, and returns for a new one', async () => {
    const response: AuthStatusResponse = {
      servers: [waitingFor('workspace-manager')],
    };
    const api = makeApi(response);
    const queryClient = await renderNotice(api);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Not now' }),
    );
    expect(screen.queryByText(/needs your sign-in/)).not.toBeInTheDocument();
    expect(
      JSON.parse(window.sessionStorage.getItem(HIDDEN_NOTICE_STORAGE_KEY)!),
    ).toEqual(['workspace-manager']);

    response.servers = [
      waitingFor('workspace-manager'),
      waitingFor('cluster-manager'),
    ];
    await queryClient.invalidateQueries({ queryKey: ['muster'] });
    expect(
      await screen.findByText('2 MCP servers need your sign-in'),
    ).toBeInTheDocument();
  });

  it('opens the sign-in dialog with a row per waiting server', async () => {
    await renderNotice(
      makeApi({
        servers: [waitingFor('workspace-manager'), sso('mcp-kubernetes')],
      }),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign in' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Sign in to MCP servers');
    expect(dialog).toHaveTextContent('workspace-manager');
    expect(dialog).toHaveTextContent(
      '1 more server comes with your portal sign-in.',
    );
  });
});
