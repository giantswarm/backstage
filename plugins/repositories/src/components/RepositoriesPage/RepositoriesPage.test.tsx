import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { useLocation } from 'react-router-dom';
import {
  MusterServerNotConnectedError,
  RepositoriesApi,
  repositoriesApiRef,
} from '../../apis';
import {
  createInMemoryApi,
  InMemoryRepositoriesApi,
} from '../../fixtures/inMemoryApi';
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

/** Activity is judged against this moment: the fixtures' dates stand still. */
const NOW = new Date('2026-09-17T00:00:00Z');
const LIMIT = 2000;

/** The manager's read tools over the fixtures, for a Bumblebee member. */
function fakeApi(
  overrides: Partial<RepositoriesApi> = {},
  teams = ['team-bumblebee'],
): InMemoryRepositoriesApi {
  return { ...createInMemoryApi({ teams, now: NOW }), ...overrides };
}

/** Renders the page, at the URL given (a shared or reloaded view). */
async function renderPage(api: RepositoriesApi, url = '/') {
  return renderInTestApp(
    <TestApiProvider apis={[[repositoriesApiRef, api]]}>
      <RepositoriesProviders>
        <RepositoriesPage />
        <LocationProbe />
      </RepositoriesProviders>
    </TestApiProvider>,
    { initialRouteEntries: [url] },
  );
}

const urlSearch = () => screen.getByTestId('location').textContent;

/** The row of a repository; the cell names it without the org. */
const findRow = (name: string) =>
  screen.findByRole('row', { name: new RegExp(`\\b${name}\\b`) });

/** The listed repositories, in table order (the Repository cell of every row). */
const listed = () =>
  screen
    .getAllByRole('row')
    .map(tr => tr.querySelectorAll('td')[1]?.textContent ?? '')
    .filter(name => name !== '');

/** A ui-react Autocomplete's input, through the label wrapping the control. */
const combobox = (label: string) =>
  screen.getByLabelText(new RegExp(`^${label}`));

const group = (label: string) => screen.getByRole('group', { name: label });

async function openAll(api: RepositoriesApi) {
  await renderPage(api);
  await findRow('present-service');
  await userEvent.click(screen.getByRole('tab', { name: 'All repositories' }));
  await findRow('stray-tool');
}

/** Picks one option of a ui-react Autocomplete. */
async function pick(label: string, option: string) {
  await userEvent.click(combobox(label));
  await userEvent.click(await screen.findByRole('option', { name: option }));
}

async function expand(name: string) {
  await userEvent.click(
    within(await findRow(name)).getByRole('button', {
      name: 'Detail panel visiblity toggle',
    }),
  );
  return screen.findByTestId(`record-${name}`);
}

describe('RepositoriesPage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    repositoriesQueryClient.clear();
    jest.mocked(bounceToConnect).mockClear();
  });

  it('opens on My team, hides the archived repositories and lists by name', async () => {
    const api = fakeApi();
    await renderPage(api);

    await findRow('present-service');
    expect(listed()).toEqual(['new-service', 'present-service']);
    expect(api.lists).toContainEqual({
      scope: 'mine',
      limit: LIMIT,
      archived: false,
    });
    expect(
      screen.getByRole('tab', { name: 'My team', selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('listing-summary')).toHaveTextContent(
      '2 of 2 matching repositories, 6 in the inventory; archived hidden; last sweep 2026-09-16 21:04Z',
    );
    expect(
      screen.getByRole('checkbox', { name: 'Show archived' }),
    ).not.toBeChecked();
  });

  it('opens on Unassigned for a Planeteer, without a Team filter', async () => {
    const api = fakeApi({}, ['team-planeteers']);
    await renderPage(api);
    await findRow('stray-tool');
    expect(api.lists[0].scope).toBe('unassigned');
    // The archived, undeclared fork stays hidden here too.
    expect(listed()).toEqual(['stray-tool']);
    expect(screen.queryByLabelText(/^Team/)).not.toBeInTheDocument();
    expect(combobox('Finding')).toBeInTheDocument();
  });

  it('switches scope through the tabs and keeps it in the URL', async () => {
    const api = fakeApi();
    await openAll(api);
    expect(listed()).toEqual([
      'legacy-tool',
      'new-service',
      'present-service',
      'stray-tool',
    ]);
    expect(api.lists).toContainEqual({
      scope: 'all',
      limit: LIMIT,
      archived: false,
    });
    expect(urlSearch()).toContain('scope=all');
    expect(screen.getByTestId('listing-summary')).toHaveTextContent('4 of 4');
  });

  it('Show archived lists every repository and keeps the choice in the URL', async () => {
    const api = fakeApi();
    await openAll(api);

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Show archived' }),
    );
    await findRow('old-operator');
    expect(listed()).toContain('forgotten-fork');
    // No call carried archived=true: the listing without the flag is the
    // scope's inventory query itself, served from the cache.
    expect(api.lists.every(call => call.archived !== true)).toBe(true);
    expect(urlSearch()).toContain('archived=true');
    expect(screen.getByTestId('listing-summary')).not.toHaveTextContent(
      'archived hidden',
    );

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Show archived' }),
    );
    await waitFor(() => expect(listed()).not.toContain('old-operator'));
    expect(urlSearch()).not.toContain('archived');
    expect(screen.getByTestId('listing-summary')).toHaveTextContent(
      'archived hidden',
    );
  });

  describe('filters, each the argument list_repositories receives', () => {
    it('Lifecycle: archived asks for the archived repositories themselves', async () => {
      const api = fakeApi();
      await openAll(api);
      await userEvent.click(
        within(group('Lifecycle')).getByRole('radio', { name: 'Archived' }),
      );
      await waitFor(() =>
        expect(api.lists.at(-1)).toEqual({
          scope: 'all',
          limit: LIMIT,
          lifecycle: 'archived',
        }),
      );
      await findRow('old-operator');
      expect(listed()).toEqual(['forgotten-fork', 'old-operator']);
      expect(urlSearch()).toContain('lifecycle=archived');
      expect(screen.getByTestId('listing-summary')).toHaveTextContent(
        '(filtered)',
      );
    });

    it('Lifecycle: deprecated', async () => {
      const api = fakeApi();
      await openAll(api);
      await userEvent.click(
        within(group('Lifecycle')).getByRole('radio', { name: 'Deprecated' }),
      );
      await waitFor(() =>
        expect(api.lists.at(-1)).toEqual({
          scope: 'all',
          limit: LIMIT,
          archived: false,
          lifecycle: 'deprecated',
        }),
      );
      await waitFor(() => expect(listed()).toEqual(['legacy-tool']));

      await userEvent.click(
        within(group('Lifecycle')).getByRole('radio', { name: 'Any' }),
      );
      await waitFor(() => expect(listed()).toHaveLength(4));
      expect(urlSearch()).not.toContain('lifecycle');
    });

    it('Team: the options are the scope’s whole inventory, not the filtered rows', async () => {
      const api = fakeApi();
      await openAll(api);
      // Narrow the rows to Bumblebee's first…
      await userEvent.click(
        within(group('Renovate')).getByRole('radio', { name: 'Missing' }),
      );
      await waitFor(() =>
        expect(listed()).toEqual(['new-service', 'stray-tool']),
      );
      // …and the other team is still on offer.
      await userEvent.click(combobox('Team'));
      const options = (await screen.findAllByRole('option')).map(
        option => option.textContent,
      );
      expect(options).toEqual(['No team', 'team-bumblebee', 'team-planeteers']);
      await userEvent.click(
        screen.getByRole('option', { name: 'team-planeteers' }),
      );
      await waitFor(() =>
        expect(api.lists.at(-1)).toEqual({
          scope: 'all',
          limit: LIMIT,
          archived: false,
          renovate: 'missing',
          team: 'team-planeteers',
        }),
      );
      expect(urlSearch()).toContain('team=team-planeteers');
    });

    it('Team: under My team the team goes to the manager as well', async () => {
      const api = fakeApi();
      await renderPage(api);
      await findRow('present-service');
      await pick('Team', 'team-bumblebee');
      await waitFor(() =>
        expect(api.lists.at(-1)).toEqual({
          scope: 'mine',
          limit: LIMIT,
          archived: false,
          team: 'team-bumblebee',
        }),
      );
    });

    it("Team: a team that is not the caller's, asked for in the URL under My team, shows the manager's note", async () => {
      // Under My team the options are the caller's teams; another team can
      // only arrive through a shared URL. The manager answers no rows and
      // says why; the page shows both.
      const api = fakeApi();
      await renderPage(api, '/?scope=mine&team=team-planeteers');
      await waitFor(() =>
        expect(api.lists).toContainEqual({
          scope: 'mine',
          limit: LIMIT,
          archived: false,
          team: 'team-planeteers',
        }),
      );
      await waitFor(() =>
        expect(screen.getByTestId('listing-summary')).toHaveTextContent(
          '0 of 0 matching repositories (filtered), 6 in the inventory; archived hidden; last sweep 2026-09-16 21:04Z. team-planeteers is not one of your teams',
        ),
      );
      expect(listed()).toEqual([]);
      // The URL's team is offered so the person can clear it.
      expect(combobox('Team')).toHaveValue('team-planeteers');
    });

    it('Renovate', async () => {
      const api = fakeApi();
      await openAll(api);
      await userEvent.click(
        within(group('Renovate')).getByRole('radio', { name: 'Inactive' }),
      );
      await waitFor(() =>
        expect(api.lists.at(-1)).toEqual({
          scope: 'all',
          limit: LIMIT,
          archived: false,
          renovate: 'inactive',
        }),
      );
      await waitFor(() => expect(listed()).toEqual(['legacy-tool']));
      expect(urlSearch()).toContain('renovate=inactive');
    });

    it('Visibility', async () => {
      const api = fakeApi();
      await openAll(api);
      await userEvent.click(
        within(group('Visibility')).getByRole('radio', { name: 'Private' }),
      );
      await waitFor(() =>
        expect(api.lists.at(-1)).toEqual({
          scope: 'all',
          limit: LIMIT,
          archived: false,
          visibility: 'private',
        }),
      );
      await waitFor(() => expect(listed()).toEqual(['new-service']));
    });

    it('Fork sends a boolean', async () => {
      const api = fakeApi();
      await openAll(api);
      await userEvent.click(
        within(group('Fork')).getByRole('radio', { name: 'Forks only' }),
      );
      await waitFor(() =>
        expect(api.lists.at(-1)).toEqual({
          scope: 'all',
          limit: LIMIT,
          archived: false,
          fork: true,
        }),
      );
      await waitFor(() => expect(listed()).toEqual(['stray-tool']));
      await userEvent.click(
        within(group('Fork')).getByRole('radio', { name: 'No forks' }),
      );
      await waitFor(() => expect(api.lists.at(-1)?.fork).toBe(false));
      expect(urlSearch()).toContain('fork=false');
    });

    it('Inactive for (days) sends a number', async () => {
      const api = fakeApi();
      await openAll(api);
      await userEvent.type(screen.getByLabelText('Inactive for (days)'), '365');
      await waitFor(() =>
        expect(api.lists.at(-1)).toEqual({
          scope: 'all',
          limit: LIMIT,
          archived: false,
          inactiveDays: 365,
        }),
      );
      await waitFor(() =>
        expect(listed()).toEqual(['new-service', 'stray-tool']),
      );
    });

    it('Finding: the kinds come from the scope’s inventory', async () => {
      const api = fakeApi();
      await openAll(api);
      await pick('Finding', 'renovate-inactive');
      await waitFor(() =>
        expect(api.lists.at(-1)).toEqual({
          scope: 'all',
          limit: LIMIT,
          archived: false,
          finding: 'renovate-inactive',
        }),
      );
      await waitFor(() => expect(listed()).toEqual(['legacy-tool']));
    });

    it('Search goes to the manager once the person pauses', async () => {
      const api = fakeApi();
      await openAll(api);
      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search' }),
        'present',
      );
      await waitFor(() =>
        expect(api.lists.at(-1)).toEqual({
          scope: 'all',
          limit: LIMIT,
          archived: false,
          search: 'present',
        }),
      );
      await waitFor(() =>
        expect(listed()).toEqual(['legacy-tool', 'present-service']),
      );
      expect(urlSearch()).toContain('search=present');
    });
  });

  it('sorts the table by a column', async () => {
    await openAll(fakeApi());
    await userEvent.click(screen.getByRole('button', { name: 'Team' }));
    expect(listed()).toEqual([
      'stray-tool',
      'new-service',
      'present-service',
      'legacy-tool',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Team' }));
    expect(listed()[0]).toBe('legacy-tool');
  });

  it('expands a row to the record: header, grouped facts, findings and set-up steps', async () => {
    await renderPage(fakeApi());
    const record = await expand('present-service');

    expect(
      within(record).getByRole('link', {
        name: /^giantswarm\/present-service/,
      }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/present-service');
    expect(within(record).getByTestId('setup-state')).toHaveTextContent(
      /^converged$/,
    );
    expect(
      within(record).getByText(/Record from sweep, 5m3s old/),
    ).toBeInTheDocument();

    for (const card of ['Ownership', 'Activity', 'Tooling']) {
      expect(
        within(record).getByRole('heading', { name: card }),
      ).toBeInTheDocument();
    }
    expect(
      within(record).getByText('repositories/team-bumblebee.yaml'),
    ).toBeInTheDocument();
    expect(
      within(record).getByRole('link', { name: 'Catalog entity' }),
    ).toHaveAttribute('href', '/catalog/default/component/present-service');
    expect(
      within(record).getByRole('link', { name: /^v1\.0\.0/ }),
    ).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/present-service/releases/tag/v1.0.0',
    );
    expect(
      within(record).getByRole('link', { name: /^2026-09-10/ }),
    ).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/github/actions/runs/123',
    );
    expect(
      within(record).getByText('renovate.json5, preset'),
    ).toBeInTheDocument();

    const findings = within(record).getByTestId('record-findings');
    expect(findings).toHaveTextContent('default-icon');
    expect(findings).toHaveTextContent('the repository uses the default icon');
    expect(findings).toHaveTextContent(
      'Fix: upload an icon in the repository settings',
    );

    const steps = within(record).getByTestId('setup-steps');
    expect(within(steps).getAllByRole('row')).toHaveLength(1 + 10);
    const metadata = within(steps).getByRole('row', { name: /metadata/ });
    expect(metadata).toHaveTextContent('reported');
    expect(metadata).toHaveTextContent('default icon | 1 finding');
    expect(
      within(record).queryByRole('button', { name: 'Keep' }),
    ).not.toBeInTheDocument();
  });

  it('shows the set-up steps of a repository being created and refreshes the record', async () => {
    const api = fakeApi();
    await renderPage(api);
    const record = await expand('new-service');
    expect(within(record).getByTestId('setup-state')).toHaveTextContent(
      'not converged',
    );
    const steps = within(record).getByTestId('setup-steps');
    expect(
      within(steps).getByRole('row', { name: /scaffold/ }),
    ).toHaveTextContent('drift');
    expect(
      within(steps).getByRole('row', { name: /circleci/ }),
    ).toHaveTextContent('follow project');

    await userEvent.click(
      within(record).getByRole('button', { name: 'Refresh' }),
    );
    await waitFor(() =>
      expect(api.refreshes).toEqual(['giantswarm/new-service']),
    );
    // The listing is re-read after a refresh; the table keeps the panel open
    // (rows carry an id) and renders the record afresh, so look it up again.
    const refreshed = await screen.findByTestId('record-new-service');
    expect(
      await within(refreshed).findByText(/Record from refresh, 0s old/),
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
