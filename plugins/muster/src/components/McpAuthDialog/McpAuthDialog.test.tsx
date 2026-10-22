import { screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  AuthStatusResponse,
  MusterApi,
  musterApiRef,
  ServerAuthStatus,
} from '../../apis';
import { McpAuthDialog } from './McpAuthDialog';
import { MCPServer } from '../../lib/k8s';

/** The installation's MCPServers: none, so every server keeps its name. */
const mockServers: MCPServer[] = [];
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

type Api = Pick<MusterApi, 'getAuthStatus' | 'signInServer' | 'signOutServer'>;

const status = (
  name: string,
  state: ServerAuthStatus['status'],
): ServerAuthStatus => ({ name, status: state, auth_tool: 'core_auth_login' });

function makeApi(response: AuthStatusResponse): jest.Mocked<Api> {
  return {
    // A fresh object per read, as the wire gives: the tests change `response`.
    getAuthStatus: jest.fn(() => Promise.resolve({ ...response })),
    signInServer: jest.fn(),
    signOutServer: jest.fn(),
  };
}

async function renderDialog(api: Api, servers?: string[], apps?: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <McpAuthDialog
          isOpen
          onOpenChange={() => {}}
          installation="graveler"
          servers={servers}
          apps={apps}
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return queryClient;
}

describe('McpAuthDialog', () => {
  it('turns a row Connected when its sign-in lands, keeping the row', async () => {
    const response: AuthStatusResponse = {
      servers: [
        status('workspace-manager', 'auth_required'),
        status('cluster-manager', 'reauth_required'),
      ],
    };
    const api = makeApi(response);
    const queryClient = await renderDialog(api);

    const list = await screen.findByRole('list', { name: 'MCP servers' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(
      within(list).getAllByRole('button', { name: 'Sign in' }),
    ).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 MCP servers need your sign-in',
    );

    response.servers = [
      status('workspace-manager', 'connected'),
      status('cluster-manager', 'reauth_required'),
    ];
    await queryClient.invalidateQueries({ queryKey: ['muster'] });

    await waitFor(() =>
      expect(within(list).getByText('✓ Connected')).toBeInTheDocument(),
    );
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent(
      'One MCP server needs your sign-in',
    );

    response.servers = [
      status('workspace-manager', 'connected'),
      status('cluster-manager', 'connected'),
    ];
    await queryClient.invalidateQueries({ queryKey: ['muster'] });
    expect(
      await screen.findByText(
        'Done: you are signed in to every server listed.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('never counts an SSO server as needing a sign-in, even one that refused it', async () => {
    await renderDialog(
      makeApi({
        servers: [
          status('workspace-manager', 'auth_required'),
          {
            name: 'devctl',
            status: 'reauth_required',
            kind: 'sso',
            token_forwarding_enabled: true,
            sso_attempt_failed: true,
          },
          {
            name: 'mcp-kubernetes',
            status: 'connected',
            token_forwarding_enabled: true,
          },
        ],
      }),
    );

    const list = await screen.findByRole('list', { name: 'MCP servers' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('workspace-manager');
    expect(list).not.toHaveTextContent('devctl');
    expect(screen.getByRole('status')).toHaveTextContent(
      'One MCP server needs your sign-in',
    );
    expect(
      screen.getByText('1 more server comes with your portal sign-in.'),
    ).toBeInTheDocument();
  });

  it('offers only the servers a feature asks for', async () => {
    await renderDialog(
      makeApi({
        servers: [
          status('workspace-manager', 'auth_required'),
          status('cluster-manager', 'auth_required'),
        ],
      }),
      ['workspace-manager'],
    );

    const list = await screen.findByRole('list', { name: 'MCP servers' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('workspace-manager');
    expect(list).not.toHaveTextContent('cluster-manager');
    // Its sign-in is the Git provider connection itself, and the row says so.
    expect(list).toHaveTextContent(
      'Connects your GitHub or GitLab account, whichever this installation uses.',
    );
  });

  it('says so when nothing waits', async () => {
    await renderDialog(
      makeApi({ servers: [status('workspace-manager', 'connected')] }),
      ['workspace-manager'],
    );
    expect(
      await screen.findByText('You are signed in to every MCP server here.'),
    ).toBeInTheDocument();
  });

  it('lists a row per provider App beside the servers, with its state', async () => {
    const api = makeApi({
      servers: [status('workspace-manager', 'auth_required')],
      providerApps: [
        { name: 'chatgpt', status: 'auth_required' },
        { name: 'github', status: 'connected' },
      ],
    });
    await renderDialog(api);

    expect(
      await screen.findByRole('heading', { name: 'Sign in to MCP servers' }),
    ).toBeInTheDocument();
    const apps = await screen.findByRole('list', { name: 'Connections' });
    const rows = within(apps).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('ChatGPT');
    expect(rows[0]).toHaveTextContent(
      'Your codex agents run on your own ChatGPT subscription.',
    );
    expect(
      within(rows[0]).getByRole('button', { name: 'Connect' }),
    ).toBeEnabled();
    expect(rows[1]).toHaveTextContent('github');
    expect(rows[1]).toHaveTextContent('✓ Connected');
    expect(
      screen.getByRole('list', { name: 'MCP servers' }),
    ).toBeInTheDocument();
  });

  it('offers only the App a feature asks for, without the servers', async () => {
    const api = makeApi({
      servers: [status('workspace-manager', 'auth_required')],
      providerApps: [
        { name: 'chatgpt', status: 'auth_required' },
        { name: 'github', status: 'auth_required' },
      ],
    });
    await renderDialog(api, [], ['chatgpt']);

    expect(
      await screen.findByRole('heading', {
        name: 'Sign in to your connections',
      }),
    ).toBeInTheDocument();
    const apps = await screen.findByRole('list', { name: 'Connections' });
    expect(within(apps).getAllByRole('listitem')).toHaveLength(1);
    expect(apps).toHaveTextContent('ChatGPT');
    expect(
      screen.queryByRole('list', { name: 'MCP servers' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
