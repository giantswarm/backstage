import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { act, screen, waitFor } from '@testing-library/react';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { PlansApi, plansApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
import { MergedTab } from './MergedTab';

describe('MergedTab', () => {
  afterEach(() => focusManager.setFocused(undefined));

  it('waits on the retry after a 500 instead of saying there are no plans', async () => {
    // A background tab: react-query pauses the retry until the tab is focused,
    // and the query stays pending without fetching (`isLoading` is false).
    focusManager.setFocused(false);
    const plansApi = {
      getTree: jest
        .fn()
        .mockRejectedValueOnce(new Error('500 Internal Server Error'))
        .mockResolvedValue({
          tree: [{ path: 'gpu-pool/README.md', type: 'blob' }],
        }),
      listEpics: jest.fn(async () => ({ merged: [], pulls: [] })),
      getContent: jest.fn(async () => ({ content: '# GPU pool' })),
    } as unknown as PlansApi;

    const client = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
    });

    await renderInTestApp(
      <TestApiProvider apis={[[plansApiRef, plansApi]]}>
        <QueryClientProvider client={client}>
          <MergedTab repo="giantswarm/plans" />
        </QueryClientProvider>
      </TestApiProvider>,
      { mountedRoutes: { '/plans': rootRouteRef } },
    );

    // The first read failed and its retry waits for the tab.
    await waitFor(() =>
      expect(
        client.getQueryCache().findAll({ fetchStatus: 'paused' }),
      ).not.toHaveLength(0),
    );
    expect(screen.getByTestId('progress')).toBeInTheDocument();
    expect(screen.queryByText('No merged plans')).not.toBeInTheDocument();

    act(() => focusManager.setFocused(true));

    expect(await screen.findByText('gpu-pool')).toBeInTheDocument();
    expect(plansApi.getTree).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('No merged plans')).not.toBeInTheDocument();
  });
});
