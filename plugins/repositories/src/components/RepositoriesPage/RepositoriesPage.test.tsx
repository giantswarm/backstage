import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import {
  InventoryRecord,
  ListFilters,
  ManagerInfo,
  MusterServerNotConnectedError,
  RepositoriesApi,
  repositoriesApiRef,
  RepositoryRow,
} from '../../apis';
import { unusedWrites } from '../../fixtures/fakeApi';
import {
  listingOf,
  newService,
  presentService,
  records,
  rowOf,
  strayTool,
} from '../../fixtures/records';
import { useLocation } from 'react-router-dom';
import {
  RepositoriesProviders,
  repositoriesQueryClient,
} from '../RepositoriesProviders';
import { bounceToConnect } from '../connectBounce';
import { RepositoriesPage } from './RepositoriesPage';

// The bounce navigates the window; observe the call instead.
jest.mock('../connectBounce', () => ({
  ...jest.requireActual('../connectBounce'),
  bounceToConnect: jest.fn(),
}));

/** The router's URL, for asserting what the page keeps there. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

const info = (groups: string[]): ManagerInfo => ({
  version: 'v0.3.0',
  toolPrefix: 'giantswarm-repo-manager',
  caller: { email: 'alice@example.com', groups },
  github: {
    apiUrl: '',
    grant: { obtained: true, login: 'alice' },
    circleciConfigured: false,
  },
  inventory: { connected: true, records: 3 },
});

const declared = [presentService, newService].map(rowOf);
const unassigned = [rowOf(strayTool)];
const everything = [...declared, ...unassigned];

/**
 * The manager's two read tools over the fixture records: the listing
 * answers by scope the way `list_repositories` does for a Bumblebee member,
 * a filter narrows it, `get_repository` returns the record.
 */
function fakeApi(overrides: Partial<RepositoriesApi> = {}): RepositoriesApi & {
  lists: ListFilters[];
  refreshes: string[];
} {
  const lists: ListFilters[] = [];
  const refreshes: string[] = [];
  return {
    lists,
    refreshes,
    getConnection: async () => ({ connected: true }),
    getInfo: async () => info(['giantswarm-github:giantswarm:team-bumblebee']),
    listRepositories: async filters => {
      lists.push(filters);
      const byScope: Record<string, RepositoryRow[]> = {
        unassigned,
        all: everything,
      };
      let rows = byScope[filters.scope ?? 'mine'] ?? declared;
      if (filters.search) {
        rows = rows.filter(row => row.repository.includes(filters.search!));
      }
      if (filters.renovate === 'missing') {
        rows = rows.filter(row => row.findings?.includes('renovate-missing'));
      }
      return listingOf(rows);
    },
    getRepository: async name => records[name],
    refreshRepository: async name => {
      refreshes.push(name);
      return {
        ...records[name],
        source: 'refresh',
        age: '0s',
      } as InventoryRecord;
    },
    ...unusedWrites,
    ...overrides,
  };
}

async function renderPage(api: RepositoriesApi) {
  return renderInTestApp(
    <TestApiProvider apis={[[repositoriesApiRef, api]]}>
      <RepositoriesProviders>
        <RepositoriesPage />
        <LocationProbe />
      </RepositoriesProviders>
    </TestApiProvider>,
  );
}

const urlSearch = () => screen.getByTestId('location').textContent;

async function openAll(api: RepositoriesApi) {
  await renderPage(api);
  await screen.findByTestId('row-present-service');
  await userEvent.click(screen.getByRole('tab', { name: 'All repositories' }));
  await screen.findByTestId('row-stray-tool');
}

const table = () => screen.getByRole('table', { name: 'Repositories' });

describe('RepositoriesPage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    repositoriesQueryClient.clear();
    jest.mocked(bounceToConnect).mockClear();
  });

  it('opens on My team and lists the team repositories with the tiles', async () => {
    const api = fakeApi();
    await renderPage(api);

    expect(
      await screen.findByTestId('row-present-service'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('row-new-service')).toBeInTheDocument();
    expect(screen.queryByTestId('row-stray-tool')).not.toBeInTheDocument();
    expect(api.lists[0].scope).toBe('mine');
    expect(
      screen.getByRole('tab', { name: 'My team', selected: true }),
    ).toBeInTheDocument();

    const setup = screen.getByTestId('tile-set-up-state');
    expect(within(setup).getByTestId('count-converged')).toHaveTextContent('1');
    expect(within(setup).getByTestId('count-not converged')).toHaveTextContent(
      '1',
    );
    expect(within(setup).getByTestId('count-unchecked')).toHaveTextContent('0');
    const score = screen.getByTestId('tile-orphan-score');
    expect(within(score).getByTestId('count-healthy (< 30)')).toHaveTextContent(
      '1',
    );
    expect(within(score).getByTestId('count-watch (30–59)')).toHaveTextContent(
      '1',
    );
    expect(
      within(screen.getByTestId('tile-lifecycle')).getByTestId('count-active'),
    ).toHaveTextContent('2');
    expect(screen.getByTestId('listing-summary')).toHaveTextContent(
      '2 of 2 matching repositories, 3 in the inventory',
    );
  });

  it('opens on Unassigned for a Planeteer', async () => {
    const api = fakeApi({
      getInfo: async () =>
        info(['giantswarm-github:giantswarm:team-planeteers']),
    });
    await renderPage(api);
    expect(await screen.findByTestId('row-stray-tool')).toBeInTheDocument();
    expect(api.lists[0].scope).toBe('unassigned');
  });

  it('switches scope through the tabs and keeps it in the URL', async () => {
    const api = fakeApi();
    await renderPage(api);
    await screen.findByTestId('row-present-service');

    await userEvent.click(
      screen.getByRole('tab', { name: 'All repositories' }),
    );
    expect(await screen.findByTestId('row-stray-tool')).toBeInTheDocument();
    expect(api.lists.at(-1)?.scope).toBe('all');
    expect(urlSearch()).toContain('scope=all');
    expect(screen.getByTestId('listing-summary')).toHaveTextContent('3 of 3');
  });

  it('passes a filter to list_repositories and marks the listing filtered', async () => {
    const api = fakeApi();
    await openAll(api);

    await userEvent.selectOptions(screen.getByLabelText('Renovate'), 'missing');
    await waitFor(() => expect(api.lists.at(-1)?.renovate).toBe('missing'));
    expect(await screen.findByTestId('row-new-service')).toBeInTheDocument();
    expect(screen.queryByTestId('row-present-service')).not.toBeInTheDocument();
    expect(screen.getByTestId('listing-summary')).toHaveTextContent(
      '(filtered)',
    );
    expect(urlSearch()).toContain('renovate=missing');
    expect(urlSearch()).toContain('scope=all');
  });

  it('sorts the table by a column', async () => {
    await openAll(fakeApi());

    const names = () =>
      within(table())
        .getAllByTestId(/^row-/)
        .map(row => row.querySelector('th')?.textContent);
    // The manager's order: by orphan score, highest first.
    expect(names()).toEqual([
      'giantswarm/stray-tool',
      'giantswarm/new-service',
      'giantswarm/present-service',
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Repository' }));
    expect(names()).toEqual([
      'giantswarm/new-service',
      'giantswarm/present-service',
      'giantswarm/stray-tool',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Repository' }));
    expect(names()[0]).toBe('giantswarm/stray-tool');
  });

  it('expands a row to the record with its findings, links and set-up steps', async () => {
    await renderPage(fakeApi());
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Expand giantswarm/present-service',
      }),
    );

    const record = await screen.findByTestId('record-present-service');
    expect(
      within(record).getByRole('link', { name: /^Repository/ }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/present-service');
    expect(
      within(record).getByRole('link', { name: 'Catalog entity' }),
    ).toBeInTheDocument();
    expect(
      within(record).getByRole('link', { name: /Last reconciler run/ }),
    ).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/github/actions/runs/123',
    );
    expect(
      within(record).getByRole('link', { name: /^Release v1\.0\.0/ }),
    ).toBeInTheDocument();
    expect(within(record).getByTestId('record-findings')).toHaveTextContent(
      '[default-icon] the repository uses the default icon',
    );
    expect(within(record).getByTestId('record-findings')).toHaveTextContent(
      'fix: upload an icon in the repository settings',
    );
    expect(within(record).getByTestId('setup-state')).toHaveTextContent(
      'converged',
    );
    const steps = within(record).getByRole('table', { name: 'Set-up' });
    expect(within(steps).getAllByRole('row')).toHaveLength(1 + 10);
    expect(within(steps).getByText('metadata').closest('tr')).toHaveTextContent(
      'reported',
    );
    expect(within(steps).getByText('metadata').closest('tr')).toHaveTextContent(
      'default icon | 1 finding',
    );
    expect(
      within(record).getByText(/Record from sweep, 5m3s old/),
    ).toBeInTheDocument();
  });

  it('shows the set-up steps of a repository being created and refreshes the record', async () => {
    const api = fakeApi();
    await renderPage(api);
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Expand giantswarm/new-service',
      }),
    );
    const record = await screen.findByTestId('record-new-service');
    expect(within(record).getByTestId('setup-state')).toHaveTextContent(
      'not converged',
    );
    const steps = within(record).getByRole('table', { name: 'Set-up' });
    expect(within(steps).getByText('scaffold').closest('tr')).toHaveAttribute(
      'data-verdict',
      'drift',
    );
    expect(within(steps).getByText('circleci').closest('tr')).toHaveTextContent(
      'follow project',
    );

    await userEvent.click(
      within(record).getByRole('button', { name: 'Refresh' }),
    );
    await waitFor(() =>
      expect(api.refreshes).toEqual(['giantswarm/new-service']),
    );
    expect(
      await within(record).findByText(/Record from refresh, 0s old/),
    ).toBeInTheDocument();
  });

  it('bounces through muster connect when the person has no grant', async () => {
    const api = fakeApi({
      listRepositories: async () => {
        throw new MusterServerNotConnectedError(
          'no grant',
          'https://muster.example/oauth/proxy/start?state=abc',
        );
      },
    });
    await renderPage(api);
    expect(
      await screen.findByText('Connecting to the repository manager…'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(bounceToConnect).toHaveBeenCalledWith(
        'https://muster.example/oauth/proxy/start?state=abc',
      ),
    );
    expect(
      screen.queryByRole('button', { name: 'Connect' }),
    ).not.toBeInTheDocument();
  });

  it('offers Connect when a bounce just came back without a grant', async () => {
    window.sessionStorage.setItem(
      'repositories.manager.connect-bounce',
      String(Date.now()),
    );
    const api = fakeApi({
      listRepositories: async () => {
        throw new MusterServerNotConnectedError(
          'no grant',
          'https://muster.example/start',
        );
      },
    });
    await renderPage(api);
    expect(
      await screen.findByText('Connect to the repository manager'),
    ).toBeInTheDocument();
    expect(bounceToConnect).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(bounceToConnect).toHaveBeenCalledWith(
      'https://muster.example/start',
    );
  });
});
