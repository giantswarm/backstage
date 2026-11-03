import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RoadmapApi,
  roadmapApiRef,
  RoadmapField,
  RoadmapItem,
  RoadmapItemFilters,
  RoadmapItemsResponse,
} from '../../apis';
import { rootRouteRef } from '../../routes';
import { BoardView } from './BoardView';

/** Resolves only when released, so a slow column can be inspected. */
function deferred<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>(resolve => {
    release = resolve;
  });
  return { promise, release };
}

const FIELDS: RoadmapField[] = [
  { name: 'Status', type: 'singleSelect', options: ['Backlog', 'Done'] },
];

function item(id: string, title: string, status?: string): RoadmapItem {
  return {
    id,
    title,
    number: 1,
    repo: 'giantswarm/backstage',
    private: false,
    fields: status ? { Status: status } : {},
  };
}

function renderBoard(listItems: RoadmapApi['listItems']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <TestApiProvider
      apis={[[roadmapApiRef, { listItems } as unknown as RoadmapApi]]}
    >
      <QueryClientProvider client={queryClient}>
        <BoardView filters={{ team: 'Atlas' }} schemaFields={FIELDS} />
      </QueryClientProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/': rootRouteRef } },
  );
}

const column = (name: string) =>
  screen.getByText(name, { selector: 'p' }).closest('div')!.parentElement!;

describe('BoardView', () => {
  it('reads every column at once and shows each as it lands', async () => {
    const done = deferred<RoadmapItemsResponse>();
    const listItems = jest.fn((filters: RoadmapItemFilters = {}) => {
      if (filters.status === 'Done') {
        return done.promise;
      }
      if (filters.status === 'Backlog') {
        return Promise.resolve({
          items: [item('a', 'Plan the warm-up', 'Backlog')],
        });
      }
      return Promise.resolve({ items: [] });
    });
    await renderBoard(listItems);

    expect(listItems.mock.calls.map(([filters]) => filters)).toEqual([
      { team: 'Atlas', status: 'Backlog' },
      { team: 'Atlas', status: 'Done' },
      { team: 'Atlas', empty: 'status' },
    ]);

    expect(await screen.findByText('Plan the warm-up')).toBeInTheDocument();
    expect(within(column('Done')).getByTestId('progress')).toBeInTheDocument();
    expect(within(column('Backlog')).queryByTestId('progress')).toBeNull();

    done.release({ items: [item('b', 'Ship the release', 'Done')] });

    expect(await screen.findByText('Ship the release')).toBeInTheDocument();
    expect(screen.queryByTestId('progress')).toBeNull();
    expect(listItems).toHaveBeenCalledTimes(3);
  });

  it('shows the items without a status in their own column', async () => {
    await renderBoard(async (filters: RoadmapItemFilters = {}) => ({
      items: filters.empty ? [item('c', 'Triage me')] : [],
    }));

    expect(await screen.findByText('Triage me')).toBeInTheDocument();
    expect(within(column('No status')).getByText('Triage me')).toBeDefined();
  });

  it('keeps the read columns when one column fails', async () => {
    await renderBoard(async (filters: RoadmapItemFilters = {}) => {
      if (filters.status === 'Done') {
        throw new Error('no answer within the timeout');
      }
      return {
        items:
          filters.status === 'Backlog'
            ? [item('a', 'Plan the warm-up', 'Backlog')]
            : [],
      };
    });

    expect(await screen.findByText('Plan the warm-up')).toBeInTheDocument();
    expect(
      await screen.findByText('no answer within the timeout'),
    ).toBeInTheDocument();
    expect(within(column('Done')).getByText('not loaded')).toBeInTheDocument();
  });

  it('says why when no column could be read', async () => {
    await renderBoard(async () => {
      throw new Error('GitHub rejected the request');
    });

    expect(
      await screen.findByText('GitHub rejected the request'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No board items')).toBeNull();
  });

  it('says so when the board is empty', async () => {
    await renderBoard(async () => ({ items: [] }));

    expect(await screen.findByText('No board items')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('progress')).toBeNull());
  });
});
