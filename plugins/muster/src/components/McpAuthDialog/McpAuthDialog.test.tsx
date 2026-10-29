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

async function renderDialog(
  api: Api,
  servers?: string[],
  apps?: string[],
  seed?: (client: QueryClient) => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  seed?.(queryClient);
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

function Harness({
  api,
  queryClient,
  isOpen,
}: {
  api: Api;
  queryClient: QueryClient;
  isOpen: boolean;
}) {
  return (
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <McpAuthDialog
          isOpen={isOpen}
          onOpenChange={() => {}}
          installation="graveler"
        />
      </QueryClientProvider>
    </TestApiProvider>
  );
}

describe('McpAuthDialog', () => {
  it('reads the status once per opening', async () => {
    const api = makeApi({
      servers: [status('workspace-manager', 'auth_required')],
    });
    await renderDialog(api, undefined, undefined, client =>
      client.setQueryData(
        ['muster', 'auth-status', 'graveler'],
        { servers: [status('workspace-manager', 'auth_required')] },
        { updatedAt: Date.now() - 60_000 },
      ),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'One MCP server needs your sign-in',
    );
    expect(api.getAuthStatus).toHaveBeenCalledTimes(1);
  });

  it('counts from the new opening’s read when it is kept mounted and opened again', async () => {
    const response: AuthStatusResponse = {
      servers: [
        status('workspace-manager', 'auth_required'),
        status('cluster-manager', 'auth_required'),
      ],
    };
    const api = makeApi(response);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = await renderInTestApp(
      <Harness api={api} queryClient={queryClient} isOpen />,
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      '2 MCP servers need your sign-in',
    );

    rerender(<Harness api={api} queryClient={queryClient} isOpen={false} />);
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    // cluster-manager was signed in to elsewhere meanwhile.
    response.servers = [
      status('workspace-manager', 'auth_required'),
      status('cluster-manager', 'connected'),
    ];
    rerender(<Harness api={api} queryClient={queryClient} isOpen />);

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'One MCP server needs your sign-in',
      ),
    );
    const list = screen.getByRole('list', { name: 'MCP servers' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).not.toHaveTextContent('cluster-manager');
  });

  it('turns an App connected in the dialog Connected, without Disconnect', async () => {
    const response: AuthStatusResponse = {
      servers: [],
      providerApps: [{ name: 'chatgpt', status: 'auth_required' }],
    };
    const queryClient = await renderDialog(makeApi(response), [], ['chatgpt']);
    const apps = await screen.findByRole('list', { name: 'Connections' });
    expect(
      within(apps).getByRole('button', { name: 'Connect' }),
    ).toBeInTheDocument();

    response.providerApps = [{ name: 'chatgpt', status: 'connected' }];
    await queryClient.invalidateQueries({ queryKey: ['muster'] });

    await waitFor(() =>
      expect(within(apps).getByText('✓ Connected')).toBeInTheDocument(),
    );
    expect(
      within(apps).queryByRole('button', { name: 'Disconnect' }),
    ).not.toBeInTheDocument();
  });

  it('takes muster’s kind over the SSO flags where it sends one', async () => {
    await renderDialog(
      makeApi({
        servers: [
          // A grant server that also forwards the sign-in: it needs the grant.
          {
            ...status('workspace-manager', 'auth_required'),
            kind: 'grant',
            token_forwarding_enabled: true,
          },
          // An SSO server marked by its kind alone.
          { name: 'mcp-kubernetes', status: 'connected', kind: 'sso' },
        ],
      }),
    );

    const list = await screen.findByRole('list', { name: 'MCP servers' });
    expect(list).toHaveTextContent('workspace-manager');
    expect(
      screen.getByText('1 more server comes with your portal sign-in.'),
    ).toBeInTheDocument();
  });

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

  it('lists a provider App only while it needs a sign-in, and counts it', async () => {
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
    // github is connected: it is disconnected on the Profile page, not here.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('ChatGPT');
    expect(rows[0]).toHaveTextContent(
      'Your codex agents run on your own ChatGPT subscription.',
    );
    expect(
      within(rows[0]).getByRole('button', { name: 'Connect' }),
    ).toBeEnabled();
    expect(screen.queryByText('github')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Disconnect' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'MCP servers' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 MCP server and 1 connection need your sign-in before agents and portal features can use them.',
    );
  });

  it('lists no connections while every provider App is connected', async () => {
    await renderDialog(
      makeApi({
        servers: [status('workspace-manager', 'auth_required')],
        providerApps: [{ name: 'github', status: 'connected' }],
      }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'One MCP server needs your sign-in before agents and portal features can use its tools.',
    );
    expect(
      screen.queryByRole('list', { name: 'Connections' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Disconnect' }),
    ).not.toBeInTheDocument();
  });

  it('counts a provider App alone when no server waits', async () => {
    await renderDialog(
      makeApi({
        servers: [status('workspace-manager', 'connected')],
        providerApps: [{ name: 'chatgpt', status: 'auth_required' }],
      }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'One connection needs your sign-in before your agents can use it.',
    );
  });

  it('counts from a fresh read when it opens, not from the status read before', async () => {
    const api = makeApi({
      servers: [
        status('workspace-manager', 'auth_required'),
        status('cluster-manager', 'connected'),
      ],
    });
    // What the inbox read a while ago, while cluster-manager still waited.
    const before: AuthStatusResponse = {
      servers: [
        status('workspace-manager', 'auth_required'),
        status('cluster-manager', 'auth_required'),
      ],
    };
    await renderDialog(api, undefined, undefined, client =>
      client.setQueryData(['muster', 'auth-status', 'graveler'], before, {
        updatedAt: Date.now() - 60_000,
      }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'One MCP server needs your sign-in',
    );
    const list = screen.getByRole('list', { name: 'MCP servers' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).not.toHaveTextContent('cluster-manager');
    expect(api.getAuthStatus).toHaveBeenCalled();
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
