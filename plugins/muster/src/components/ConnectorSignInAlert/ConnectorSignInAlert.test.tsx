import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  AuthStatusResponse,
  MusterApi,
  musterApiRef,
  MusterUnauthorizedError,
} from '../../apis';
import {
  ConnectorSignInAlert,
  splitConnectorSignIns,
} from './ConnectorSignInAlert';

type Api = Pick<MusterApi, 'getAuthStatus' | 'signInServer' | 'signOutServer'>;

function status(value: 'auth_required' | 'connected'): AuthStatusResponse {
  return {
    servers: [
      { name: 'cluster-manager', status: value, auth_tool: 'core_auth_login' },
    ],
  };
}

async function renderAlert(
  props: Partial<Parameters<typeof ConnectorSignInAlert>[0]> = {},
  initial: AuthStatusResponse = status('auth_required'),
) {
  let current = initial;
  const api: Api = {
    getAuthStatus: jest.fn(async () => current),
    signInServer: jest.fn(async () => ({
      status: 'auth_required' as const,
      authUrl: 'https://muster.gazelle.example.io/oauth/proxy/start?state=abc',
      message: '',
    })),
    signOutServer: jest.fn(),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api as MusterApi]]}>
      <QueryClientProvider client={queryClient}>
        <ConnectorSignInAlert
          server="cluster-manager"
          installations={['gazelle']}
          purpose="see GPU node pools"
          {...props}
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return {
    api,
    queryClient,
    signInLands: async () => {
      current = status('connected');
      await act(() =>
        queryClient.invalidateQueries({
          queryKey: ['muster', 'auth-status', 'gazelle'],
        }),
      );
    },
  };
}

beforeEach(() => {
  jest.spyOn(window, 'open').mockReturnValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ConnectorSignInAlert', () => {
  it('names the connector and the data, and offers its sign-in', async () => {
    const { api } = await renderAlert();

    expect(
      screen.getByText('Sign in to cluster-manager to see GPU node pools'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not signed in to it on gazelle yet/),
    ).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(api.signInServer).toHaveBeenCalledWith('cluster-manager', 'gazelle');
  });

  it('reads the page again once the sign-in lands', async () => {
    const onSignedIn = jest.fn();
    const { queryClient, signInLands } = await renderAlert({ onSignedIn });
    await waitFor(() =>
      expect(
        queryClient.getQueryData(['muster', 'auth-status', 'gazelle']),
      ).toEqual(status('auth_required')),
    );
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await signInLands();

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['muster'] });
  });

  // giantswarm/backstage#3236 review: an SSO connector has nothing to sign in
  // to, so the alert does not ask for a sign-in.
  it('says an SSO connector could not connect, without asking for a sign-in', async () => {
    await renderAlert(
      {},
      {
        servers: [
          {
            name: 'cluster-manager',
            status: 'auth_required',
            kind: 'sso',
            auth_tool: 'core_auth_login',
          },
        ],
      },
    );

    expect(
      await screen.findByText('Could not connect to cluster-manager'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Sign in to cluster-manager to see GPU node pools'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('names each environment that needs the sign-in', async () => {
    await renderAlert({ installations: ['gazelle', 'golem'] });

    expect(
      screen.getByText(/not signed in to it on gazelle, golem yet/),
    ).toBeVisible();
    expect(screen.getByText('golem')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Sign in' })).toHaveLength(2);
  });
});

describe('splitConnectorSignIns', () => {
  it('groups the reads that ask for a sign-in by connector, and keeps the rest', () => {
    const signIn = new MusterUnauthorizedError(
      'sign in',
      'server_sign_in_required',
      'cluster-manager',
    );
    const other = new Error('cluster-manager is down');
    const wrapped = new Error('refused', { cause: signIn });

    expect(
      splitConnectorSignIns([
        { installation: 'gazelle', error: signIn },
        { installation: 'golem', error: wrapped },
        { installation: 'wombat', error: other },
      ]),
    ).toEqual({
      signIns: [
        { server: 'cluster-manager', installations: ['gazelle', 'golem'] },
      ],
      others: [{ installation: 'wombat', error: other }],
    });
  });
});
