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

async function renderDialog(api: Api, servers?: string[]) {
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
});
