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

  describe('links between documents', () => {
    const RealScrollIntoView = Element.prototype.scrollIntoView;
    let scrolledTo: Element[];

    beforeAll(() => {
      // jsdom does not scroll.
      Element.prototype.scrollIntoView = function scrollIntoView(
        this: Element,
      ) {
        scrolledTo.push(this);
      };
    });

    afterAll(() => {
      Element.prototype.scrollIntoView = RealScrollIntoView;
    });

    beforeEach(() => {
      scrolledTo = [];
    });

    const contents: Record<string, string> = {
      'beekeeper/PRD.md': [
        '# Beekeeper',
        '',
        '[Failures](design/operations.md#failures)',
        '[Other plan](../connector-manager/PRD.md)',
        '[Config](config.yaml)',
      ].join('\n'),
      'beekeeper/design/operations.md':
        '# Operations\n\n## Failures\n\nRetries.',
      'connector-manager/PRD.md': '# Connector manager',
    };
    const plansApi = {
      getTree: jest.fn(async () => ({
        tree: [
          'beekeeper/PRD.md',
          'beekeeper/design/operations.md',
          'beekeeper/config.yaml',
          'connector-manager/PRD.md',
        ].map(path => ({ path, type: 'blob' })),
      })),
      listEpics: jest.fn(async () => ({ merged: [], pulls: [] })),
      getContent: jest.fn(async (path: string) => ({
        path,
        content: contents[path],
      })),
    } as unknown as PlansApi;

    const renderAt = (entry: string) =>
      renderInTestApp(
        <TestApiProvider apis={[[plansApiRef, plansApi]]}>
          <QueryClientProvider client={new QueryClient()}>
            <MergedTab repo="giantswarm/team-plans" />
          </QueryClientProvider>
        </TestApiProvider>,
        {
          mountedRoutes: { '/plans': rootRouteRef },
          initialRouteEntries: [entry],
        },
      );

    it('opens a plan’s document on the page and any other file on GitHub', async () => {
      await renderAt('/plans?repo=giantswarm%2Fteam-plans&plan=beekeeper');

      const href = async (name: string) =>
        new URL(
          (
            await screen.findByRole('link', { name: new RegExp(`^${name}`) })
          ).getAttribute('href')!,
          'https://portal.example.com',
        );

      const failures = await href('Failures');
      expect(failures.pathname).toBe('/plans');
      expect(failures.searchParams.get('repo')).toBe('giantswarm/team-plans');
      expect(failures.searchParams.get('plan')).toBe('beekeeper');
      expect(failures.searchParams.get('doc')).toBe(
        'beekeeper/design/operations.md',
      );
      expect(failures.hash).toBe('#failures');

      const other = await href('Other plan');
      expect(other.searchParams.get('plan')).toBe('connector-manager');
      expect(other.searchParams.get('doc')).toBe('connector-manager/PRD.md');

      expect((await href('Config')).href).toBe(
        'https://github.com/giantswarm/team-plans/blob/HEAD/beekeeper/config.yaml',
      );
    });

    it('scrolls to the linked document’s anchor', async () => {
      await renderAt(
        '/plans?plan=beekeeper&doc=beekeeper%2Fdesign%2Foperations.md#failures',
      );

      const heading = await screen.findByRole('heading', { name: 'Failures' });
      await waitFor(() => expect(scrolledTo).toEqual([heading]));
    });
  });
});
