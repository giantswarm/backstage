import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { musterApiRef } from '../../apis';
import { mcpServersRouteRef } from '../../routes';
import { MCPServer, MCPServerState } from '../../lib/k8s';
import { CustomizeConnectorsPanel } from './CustomizeConnectorsPanel';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => children,
}));

let mockServers: MCPServer[] = [];
let mockAuthenticated = true;
let mockInstance: Record<string, unknown> = {};
jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['gazelle'],
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    scope: 'gazelle',
    homeInstallation: 'gazelle',
    isSingleInstallation: true,
    activeInstallationInfo: { name: 'gazelle', requiresAuth: true },
    mcpServers: mockServers,
    workflows: [],
    isLoading: false,
    ...mockInstance,
  }),
  useMusterSession: () => ({
    authenticated: mockAuthenticated,
    pending: false,
    connecting: false,
    connect: jest.fn(),
  }),
}));

function makeServer(
  name: string,
  options: {
    state?: MCPServerState;
    auth?: Record<string, unknown>;
    description?: string;
  } = {},
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name },
      spec: {
        type: 'streamable-http',
        url: `https://${name}.example.test/mcp`,
        description: options.description,
        ...(options.auth ? { auth: options.auth } : {}),
      },
      status: { state: options.state ?? 'Connected' },
    } as never,
    'gazelle',
  );
}

const servers = () => [
  makeServer('github', {
    auth: { type: 'oauth' },
    state: 'Auth Required',
    description: 'Repositories and pull requests',
  }),
  makeServer('kubernetes', {
    auth: { type: 'oauth', forwardToken: true },
  }),
  makeServer('web-search'),
];

const api = {
  filterTools: jest.fn(async () => ({
    total: 3,
    filtered_count: 3,
    truncated: false,
    tools: [
      { name: 'x_github_list_pulls', description: 'List pull requests' },
      { name: 'x_github_get_issue', description: 'Read an issue' },
      { name: 'x_kubernetes_get_pods', description: 'List pods' },
    ],
  })),
  signInServer: jest.fn(async () => ({
    status: 'auth_required' as const,
    authUrl: 'https://github.example.test/login/oauth/authorize',
    message: 'Sign in to github.',
  })),
  getAuthStatus: jest.fn(async () => ({
    servers: [
      {
        name: 'github',
        status: 'auth_required' as const,
        auth_tool: 'core_auth_login',
      },
      { name: 'kubernetes', status: 'connected' as const },
      { name: 'web-search', status: 'connected' as const },
    ],
  })),
};

async function renderPanel(search = '') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <QueryClientProvider client={client}>
      <CustomizeConnectorsPanel search={search} />
    </QueryClientProvider>,
    {
      apis: [[musterApiRef, api]],
      mountedRoutes: { '/agent-platform/mcp-servers': mcpServersRouteRef },
    },
  );
}

function rowOf(name: string) {
  return screen.getByRole('row', { name: new RegExp(`^${name}`) });
}

describe('CustomizeConnectorsPanel', () => {
  beforeEach(() => {
    mockServers = servers();
    mockAuthenticated = true;
    mockInstance = {};
    api.filterTools.mockClear();
    api.getAuthStatus.mockClear();
    api.signInServer.mockClear();
    mockNavigate.mockClear();
  });

  it('shows a row per connector with its sign-in, tools and state', async () => {
    await renderPanel();

    expect(await screen.findByText('2 tools')).toBeInTheDocument();
    const github = rowOf('github');
    expect(
      within(github).getByText('Repositories and pull requests'),
    ).toBeInTheDocument();
    expect(within(github).getByText('Your own account')).toBeInTheDocument();
    expect(
      await within(github).findByText('Sign in needed'),
    ).toBeInTheDocument();
    expect(
      within(github).getByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();

    const kubernetes = rowOf('kubernetes');
    expect(within(kubernetes).getByText('Company login')).toBeInTheDocument();
    expect(within(kubernetes).getByText('1 tool')).toBeInTheDocument();
    expect(within(kubernetes).getByText('Connected')).toBeInTheDocument();
    expect(
      within(kubernetes).queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();

    expect(
      within(rowOf('web-search')).getByText('No sign-in'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('row', { name: /^muster/ }),
    ).not.toBeInTheDocument();
  });

  it('signs in from the row without opening the connector', async () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    await renderPanel();

    const github = rowOf('github');
    await user.click(
      await within(github).findByRole('button', { name: 'Sign in' }),
    );

    await waitFor(() =>
      expect(api.signInServer).toHaveBeenCalledWith('github', 'gazelle'),
    );
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(mockNavigate).not.toHaveBeenCalled();
    open.mockRestore();

    await user.click(
      within(github).getByText('Repositories and pull requests'),
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/mcp-servers/github?installation=gazelle',
      undefined,
    );
  });

  it('offers no sign-in without a muster session', async () => {
    mockAuthenticated = false;
    await renderPanel();

    expect(
      screen.queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
    expect(api.getAuthStatus).not.toHaveBeenCalled();
  });

  it('opens the connector page from its row', async () => {
    await renderPanel();

    expect(rowOf('kubernetes')).toHaveAttribute(
      'data-href',
      '/agent-platform/mcp-servers/kubernetes?installation=gazelle',
    );
  });

  it('searches connectors by their tools too', async () => {
    await renderPanel('pods');

    expect(await screen.findByText('1 of 1 tools match')).toBeInTheDocument();
    expect(screen.queryByText('github')).not.toBeInTheDocument();
  });

  it('asks for a muster session before reading tools', async () => {
    mockAuthenticated = false;
    await renderPanel();

    expect(
      screen.getByText(/Tool counts and sign-ins need a muster session/),
    ).toBeInTheDocument();
    expect(api.filterTools).not.toHaveBeenCalled();
  });

  it('says when no environment runs muster', async () => {
    mockInstance = { activeInstallation: undefined };
    await renderPanel();

    expect(screen.getByText('No connectors here')).toBeInTheDocument();
  });

  it('says when muster has no connector', async () => {
    mockServers = [];
    await renderPanel();

    expect(screen.getByText('No connectors yet')).toBeInTheDocument();
  });
});
