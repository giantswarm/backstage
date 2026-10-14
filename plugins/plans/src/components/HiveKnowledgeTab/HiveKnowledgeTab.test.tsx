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
import { HiveKnowledgeTab } from './HiveKnowledgeTab';

describe('HiveKnowledgeTab', () => {
  afterEach(() => focusManager.setFocused(undefined));

  it('shows its progress bar while the retry after a 500 waits, then the document', async () => {
    // A background tab: react-query pauses the retry until it is focused,
    // and the query stays pending without fetching (`isLoading` is false).
    focusManager.setFocused(false);
    const plansApi = {
      getMagazine: jest.fn(async () => ({
        configured: true,
        repository: 'giantswarm/magazine',
        ref: 'data',
        knowledgeRef: 'main',
      })),
      getTree: jest
        .fn()
        .mockRejectedValueOnce(new Error('500 Internal Server Error'))
        .mockResolvedValue({
          tree: [{ path: 'knowledge/product/hive.md', type: 'blob' }],
        }),
      getContent: jest.fn(async () => ({
        content: 'The magazine of the hive.',
      })),
    } as unknown as PlansApi;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
    });

    await renderInTestApp(
      <TestApiProvider apis={[[plansApiRef, plansApi]]}>
        <QueryClientProvider client={client}>
          <HiveKnowledgeTab />
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

    act(() => focusManager.setFocused(true));

    expect(
      await screen.findByText('The magazine of the hive.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No knowledge documents yet')).toBeNull();
  });
});
