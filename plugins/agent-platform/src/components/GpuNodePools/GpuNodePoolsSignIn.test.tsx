import { act, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  type MusterApi,
  musterApiRef,
  MusterUnauthorizedError,
  splitConnectorSignIns,
} from '@giantswarm/backstage-plugin-muster';
import { useGpuNodePools } from '../../hooks/useClusterManager';
import { shouldRetryQuery } from '../QueryClientProvider';
import { GpuNodePoolsPanel } from './GpuNodePoolsPanel';

/**
 * The pools card as the GPU capacity view composes it
 * (`useGpuNodePoolControls`): the pools read through cluster-manager, its
 * sign-in requests split from its failures.
 */
function PoolsCard() {
  const pools = useGpuNodePools(['gazelle']);
  const { signIns, others } = splitConnectorSignIns(pools.errors);
  return (
    <GpuNodePoolsPanel
      rows={pools.rows}
      isLoading={pools.isLoading}
      notes={pools.notes}
      errors={others}
      signIns={signIns}
      onRemove={jest.fn()}
      opened={undefined}
      onToggleLifecycle={jest.fn()}
      onCloseLifecycle={jest.fn()}
    />
  );
}

/**
 * giantswarm/giantswarm#38779: a person who has not consented to
 * cluster-manager sees its sign-in on the GPU hosting page, not an error,
 * and the page fills in once the sign-in lands, without a reload.
 */
describe('GPU node pools without a cluster-manager sign-in', () => {
  let signedIn: boolean;
  let musterApi: Pick<
    MusterApi,
    'callTool' | 'getAuthStatus' | 'signInServer'
  > & {
    callTool: jest.Mock;
    getAuthStatus: jest.Mock;
  };
  let queryClient: QueryClient;

  beforeEach(() => {
    signedIn = false;
    jest.spyOn(window, 'open').mockReturnValue(null);
    musterApi = {
      callTool: jest.fn(async () => {
        if (!signedIn) {
          throw new MusterUnauthorizedError(
            "auth_required: server 'cluster-manager' requires authentication; sign in to it to use its tools.",
            'server_sign_in_required',
            'cluster-manager',
            'gazelle',
          );
        }
        return { clusters: [], clusterApi: { served: true } };
      }),
      getAuthStatus: jest.fn(async () => ({
        servers: [
          {
            name: 'cluster-manager',
            status: signedIn
              ? ('connected' as const)
              : ('auth_required' as const),
            auth_tool: 'core_auth_login',
          },
        ],
      })),
      signInServer: jest.fn(),
    };
    // The plugin's own retry rule, so a retried 401 would show here.
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 0 } },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function renderCard() {
    await renderInTestApp(
      <TestApiProvider
        apis={[[musterApiRef, musterApi as unknown as MusterApi]]}
      >
        <QueryClientProvider client={queryClient}>
          <PoolsCard />
        </QueryClientProvider>
      </TestApiProvider>,
    );
  }

  it('offers the sign-in in place of the pools, and asks once', async () => {
    await renderCard();

    expect(
      await screen.findByText(
        'Sign in to cluster-manager to see GPU node pools',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(
      screen.queryByText('Could not read the node pools of some environments'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('No GPU node pools yet.'),
    ).not.toBeInTheDocument();
    // Not retried: the 401 asked for a sign-in.
    expect(musterApi.callTool).toHaveBeenCalledTimes(1);
  });

  it('reads the pools again once the sign-in lands', async () => {
    await renderCard();
    await screen.findByText('Sign in to cluster-manager to see GPU node pools');
    await waitFor(() => expect(musterApi.getAuthStatus).toHaveBeenCalled());

    signedIn = true;
    await act(() =>
      queryClient.invalidateQueries({
        queryKey: ['muster', 'auth-status', 'gazelle'],
      }),
    );

    expect(await screen.findByText('No GPU node pools yet.')).toBeVisible();
    expect(
      screen.queryByText('Sign in to cluster-manager to see GPU node pools'),
    ).not.toBeInTheDocument();
    expect(musterApi.callTool).toHaveBeenCalledTimes(2);
  });
});
