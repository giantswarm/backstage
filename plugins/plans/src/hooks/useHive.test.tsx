import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactElement } from 'react';
import { PlansApi, plansApiRef } from '../apis';
import { HiveHistoryTab } from '../components/HiveHistoryTab';
import { HiveNowTab } from '../components/HiveNowTab';
import { fixtureHistory, fixtureMeta, fixtureNow } from '../lib/hiveFixtures';
import { History, Now, TeamSets } from '../lib/magazine';
import { rootRouteRef } from '../routes';

const TEAMS: TeamSets = {
  version: 1,
  generatedAt: '2026-11-06T08:00:00Z',
  default: 'Bumblebee',
  teams: [
    {
      name: 'Bumblebee',
      boardTeam: 'Bumblebee🐝',
      slug: 'bumblebee',
      path: 'magazine/teams/bumblebee',
    },
    {
      name: 'Phoenix',
      boardTeam: 'Phoenix 🔥',
      slug: 'phoenix',
      path: 'magazine/teams/phoenix',
    },
  ],
};

/** Phoenix's own Now: its cards carry its name, as the magazine writes them. */
function phoenixNow(): Now {
  const now = fixtureNow();
  return {
    ...now,
    summary: ['Phoenix ships the cluster upgrade.'],
    lanes: now.lanes.map(lane => ({
      ...lane,
      cards: lane.cards.map(card => ({
        ...card,
        team: 'Phoenix',
        title: `Phoenix: ${card.title}`,
      })),
    })),
    upcoming: [],
  };
}

/** Phoenix's own History: one epic group of its own work. */
function phoenixHistory(): History {
  const history = fixtureHistory();
  const [group] = history.groups;
  return {
    ...history,
    summary: ['Phoenix closed the upgrade epic.'],
    groups: [
      {
        ...group,
        title: 'Phoenix upgrade epic',
        entries: group.entries.map(entry => ({ ...entry, team: 'Phoenix' })),
      },
    ],
  };
}

const PHOENIX_META = {
  ...fixtureMeta(),
  sources: { board: 273, team: 'Phoenix' },
};

function magazineApi(files: Record<string, unknown>) {
  const getContent = jest.fn(async (path: string) => {
    if (!(path in files)) {
      const error = new Error(`Not found: ${path}`);
      error.name = 'NotFoundError';
      throw error;
    }
    return { path, content: JSON.stringify(files[path]) };
  });
  const api = {
    getMagazine: jest.fn(async () => ({
      configured: true,
      repository: 'giantswarm/magazine',
      ref: 'data',
      knowledgeRef: 'main',
    })),
    getContent,
  } as unknown as PlansApi;
  return { api, getContent };
}

async function renderTab(tab: ReactElement, api: PlansApi, team: string) {
  await renderInTestApp(
    <TestApiProvider apis={[[plansApiRef, api]]}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        {tab}
      </QueryClientProvider>
    </TestApiProvider>,
    {
      mountedRoutes: { '/hive': rootRouteRef },
      initialRouteEntries: [`/hive?team=${encodeURIComponent(team)}`],
    },
  );
}

const renderNow = (api: PlansApi, team: string) =>
  renderTab(<HiveNowTab />, api, team);
const renderHistory = (api: PlansApi, team: string) =>
  renderTab(<HiveHistoryTab />, api, team);

describe('Hive Now, per team', () => {
  it("shows the chosen team's own Now from its data set", async () => {
    const { api, getContent } = magazineApi({
      'magazine/teams.json': TEAMS,
      'magazine/teams/phoenix/now.json': phoenixNow(),
      'magazine/teams/phoenix/meta.json': PHOENIX_META,
    });

    await renderNow(api, 'Phoenix 🔥');

    expect(
      await screen.findByText('Phoenix ships the cluster upgrade.'),
    ).toBeInTheDocument();
    const firstCard = fixtureNow().lanes.flatMap(lane => lane.cards)[0];
    expect(
      screen.getAllByText(`Phoenix: ${firstCard.title}`).length,
    ).toBeGreaterThan(0);
    // The set follows Phoenix: no note that Hive follows another team.
    expect(screen.queryByText(/Hive follows Team/)).toBeNull();
    expect(getContent).not.toHaveBeenCalledWith(
      'magazine/now.json',
      expect.anything(),
      expect.anything(),
    );
  });

  it('shows an empty state, not an error, for a team without a data set', async () => {
    const { api, getContent } = magazineApi({ 'magazine/teams.json': TEAMS });

    await renderNow(api, 'Up 🎈');

    expect(
      await screen.findByText('No magazine data for Team Up yet'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open the board' }),
    ).toHaveAttribute(
      'href',
      `/hive/roadmap?team=${encodeURIComponent('Up 🎈')}`,
    );
    expect(screen.queryByText(/Failed to load/)).toBeNull();
    expect(getContent).toHaveBeenCalledTimes(1);
  });

  it('reads the default set under magazine/ while the magazine lists no team sets', async () => {
    const { api } = magazineApi({
      'magazine/now.json': fixtureNow(),
      'magazine/meta.json': fixtureMeta(),
    });

    await renderNow(api, 'Phoenix 🔥');

    expect(
      await screen.findByText('Hive follows Team Bumblebee'),
    ).toBeInTheDocument();
  });
});

describe('Hive History, per team', () => {
  it("shows the chosen team's own History from its data set", async () => {
    const { api } = magazineApi({
      'magazine/teams.json': TEAMS,
      'magazine/teams/phoenix/history-weeks.json': phoenixHistory(),
      'magazine/teams/phoenix/meta.json': PHOENIX_META,
    });

    await renderHistory(api, 'Phoenix 🔥');

    expect(await screen.findByText('Phoenix upgrade epic')).toBeInTheDocument();
    expect(
      screen.getByText('Phoenix closed the upgrade epic.'),
    ).toBeInTheDocument();
    // Its own figures: the set follows Phoenix.
    expect(screen.getByText('Merged')).toBeInTheDocument();
    expect(screen.queryByText(/Hive follows Team/)).toBeNull();
  });

  it('shows an empty state, not an error, for a team without a data set', async () => {
    const { api } = magazineApi({ 'magazine/teams.json': TEAMS });

    await renderHistory(api, 'Up 🎈');

    expect(
      await screen.findByText('No magazine data for Team Up yet'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Failed to load/)).toBeNull();
  });

  it('reads the default set for all teams', async () => {
    const { api, getContent } = magazineApi({
      'magazine/history-weeks.json': fixtureHistory(),
      'magazine/meta.json': fixtureMeta(),
    });

    await renderHistory(api, 'all');

    expect(await screen.findByText('Merged')).toBeInTheDocument();
    expect(getContent).not.toHaveBeenCalledWith(
      'magazine/teams.json',
      expect.anything(),
      expect.anything(),
    );
  });
});
