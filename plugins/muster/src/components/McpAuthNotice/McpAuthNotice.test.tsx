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
import {
  HIDDEN_NOTICE_STORAGE_KEY,
  McpAuthNoticeContent,
} from './McpAuthNotice';

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
