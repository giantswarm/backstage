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
import { RoadmapApi, roadmapApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
import { SubIssuesPanel } from './SubIssuesPanel';

describe('SubIssuesPanel', () => {
  afterEach(() => focusManager.setFocused(undefined));

  it('waits on the retry after a 500 instead of saying there are no sub-issues', async () => {
    // A background tab: react-query pauses the retry until it is focused,
    // and the query stays pending without fetching (`isLoading` is false).
    focusManager.setFocused(false);
    const listSubIssues = jest
      .fn()
      .mockRejectedValueOnce(new Error('500 Internal Server Error'))
      .mockResolvedValue({
        subIssues: [
          {
            id: 7,
            number: 2791,
            title: 'Audit the empty states',
            state: 'open',
            htmlUrl: 'https://github.com/giantswarm/backstage/issues/2791',
            assignees: [],
          },
        ],
      });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
    });

    await renderInTestApp(
      <TestApiProvider
        apis={[[roadmapApiRef, { listSubIssues } as unknown as RoadmapApi]]}
      >
        <QueryClientProvider client={client}>
          <SubIssuesPanel owner="giantswarm" repo="roadmap" issueNumber={1} />
        </QueryClientProvider>
      </TestApiProvider>,
      { mountedRoutes: { '/': rootRouteRef } },
    );

    // The first read failed and its retry waits for the tab.
    await waitFor(() =>
      expect(
        client.getQueryCache().findAll({ fetchStatus: 'paused' }),
      ).not.toHaveLength(0),
    );
    expect(screen.getByTestId('progress')).toBeInTheDocument();
    expect(screen.queryByText('No sub-issues linked yet.')).toBeNull();

    act(() => focusManager.setFocused(true));

    expect(
      await screen.findByText('Audit the empty states', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No sub-issues linked yet.')).toBeNull();
  });
});
