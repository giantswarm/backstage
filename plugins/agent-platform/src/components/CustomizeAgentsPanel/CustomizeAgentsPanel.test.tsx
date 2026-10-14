import { type ReactNode, useState } from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { storageApiRef, type StorageApi } from '@backstage/core-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import {
  type MockedLayout,
  mockDesktopLayout,
  mockPhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import type { AgentRow, AgentsContextValue } from '../AgentsDataProvider';
import type { SessionRow } from '../SessionsDataProvider/helpers';
import { agentsRouteRef } from '../../routes';
import { CustomizeAgentsPanel } from './CustomizeAgentsPanel';

let mockAgents: Partial<AgentsContextValue>;
jest.mock('../AgentsDataProvider', () => ({
  useAgents: () => mockAgents,
}));
jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => undefined,
}));
let mockSessions: SessionRow[] = [];
jest.mock('../SessionsDataProvider', () => ({
  SessionsDataProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useSessions: () => ({
    rows: mockSessions,
    notUserScopedInstallations: [],
  }),
}));
let mockMetaAgent: AgentRow | undefined;
jest.mock('../../hooks/useMetaAgent', () => ({
  useMetaAgent: () => mockMetaAgent,
}));

function row(overrides: Partial<AgentRow>): AgentRow {
  const merged = {
    installation: 'golem',
    namespace: 'support',
    name: 'Agent',
    technicalName: 'agent',
    description: '',
    skillCount: 0,
    readiness: 'ready' as const,
    ...overrides,
  };
  // The composite id `AgentRow` carries, from the row's own values, so the
  // favorites and sessions joins resolve as they do on the fleet.
  return {
    ...merged,
    id:
      overrides.id ??
      `${merged.installation}/${merged.namespace}/${merged.technicalName}`,
  };
}

const triage = row({
  namespace: 'support',
  name: 'Support triage',
  technicalName: 'triage',
  description: 'Sorts tickets',
  model: 'Sonnet 4.5',
  skillCount: 2,
  toolset: {
    state: 'declared',
    carrier: 'triage',
    selectors: ['server:jira', 'server:slack'],
  },
});
const notes = row({
  namespace: 'engineering',
  name: 'Release notes',
  technicalName: 'notes',
  readiness: 'failed',
});

function renderPanel(search = '', storage: StorageApi = mockApis.storage()) {
  return renderInTestApp(<CustomizeAgentsPanel search={search} />, {
    mountedRoutes: { '/agent-platform/agents': agentsRouteRef },
    apis: [[storageApiRef, storage]],
  });
}

// Re-render the panel from inside the test app (its own `rerender` would drop
// the app around it), so a test can change what `useAgents` answers and watch
// one mounted panel follow, the way the provider's updates do.
let rerenderPanel: () => void = () => {};
function RerenderablePanel() {
  const [, setTick] = useState(0);
  rerenderPanel = () => setTick(tick => tick + 1);
  return <CustomizeAgentsPanel search="" />;
}

function renderRerenderablePanel() {
  return renderInTestApp(<RerenderablePanel />, {
    mountedRoutes: { '/agent-platform/agents': agentsRouteRef },
    apis: [[storageApiRef, mockApis.storage()]],
  });
}

/** A storage with these agents already favorited. */
async function storageWithFavorites(rows: AgentRow[]) {
  const storage = mockApis.storage();
  await storage.forBucket('agent-platform').set(
    'favoriteAgents',
    rows.map(each => ({
      installation: each.installation,
      namespace: each.namespace,
      name: each.technicalName,
    })),
  );
  return storage;
}

function sessionWith(agent: AgentRow, createdAt: string): SessionRow {
  return {
    id: `${agent.installation}/${agent.technicalName}-${createdAt}`,
    sessionId: `${agent.technicalName}-${createdAt}`,
    installation: agent.installation,
    title: 'Chat',
    agentName: agent.name,
    agentTechnicalName: agent.technicalName,
    agentNamespace: agent.namespace,
    createdAt,
  };
}

const manyAgents = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    row({
      name: `Agent ${String(i + 1).padStart(3, '0')}`,
      technicalName: `agent-${i + 1}`,
    }),
  );

describe('CustomizeAgentsPanel', () => {
  beforeEach(() => {
    mockAgents = {
      rows: [triage, notes],
      isLoading: false,
      hasInstallations: true,
      unreachableInstallations: [],
    };
    mockSessions = [];
    mockMetaAgent = undefined;
  });

  it('lists each agent as an avatar row of the prototype, linking to the agent', async () => {
    await renderPanel();

    // The prototype's presentation: one rounded list, an avatar row per agent
    // — no table and no column headers. Global, with no organization (D4):
    // the namespace is no organization.
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Agents' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);

    const triageLink = within(items[0]).getByRole('link');
    expect(triageLink).toHaveAttribute(
      'href',
      '/agent-platform/agents/golem/support/triage',
    );
    expect(within(triageLink).getByText('Support triage')).toBeInTheDocument();
    expect(within(triageLink).getByText('Sorts tickets')).toBeInTheDocument();
    expect(within(triageLink).getByText('Sonnet 4.5')).toBeInTheDocument();
    expect(
      within(triageLink).getByText('2 skills · 2 connectors'),
    ).toBeInTheDocument();
    expect(within(triageLink).queryByText('support')).not.toBeInTheDocument();
    // A Ready agent shows no state; one that needs a look says so inline.
    expect(within(triageLink).queryByText('Ready')).not.toBeInTheDocument();
    expect(within(items[1]).getByText('Release notes')).toBeInTheDocument();
    expect(within(items[1]).getByText('Failed')).toBeInTheDocument();
    // One environment: no environment fact.
    expect(within(list).queryByText('golem')).not.toBeInTheDocument();
  });

  it('names the environment when the agents span more than one', async () => {
    mockAgents = {
      ...mockAgents,
      rows: [
        triage,
        { ...notes, id: 'lab/engineering/notes', installation: 'lab' },
      ],
    };
    await renderPanel();

    const items = within(
      screen.getByRole('list', { name: 'Agents' }),
    ).getAllByRole('listitem');
    expect(within(items[0]).getByText('golem')).toBeInTheDocument();
    expect(within(items[1]).getByText('lab')).toBeInTheDocument();
  });

  it('narrows to the search', async () => {
    await renderPanel('triage');
    expect(screen.getByText('Support triage')).toBeInTheDocument();
    expect(screen.queryByText('Release notes')).not.toBeInTheDocument();
  });

  it('renders 300 agents a page of 25 at a time', async () => {
    mockAgents = {
      ...mockAgents,
      rows: Array.from({ length: 300 }, (_, i) =>
        row({
          name: `Agent ${String(i + 1).padStart(3, '0')}`,
          technicalName: `agent-${i + 1}`,
        }),
      ),
    };
    await renderPanel();

    const items = () =>
      within(screen.getByRole('list', { name: 'Agents' })).getAllByRole(
        'listitem',
      );
    expect(items()).toHaveLength(25);
    expect(screen.getByText('25 agents shown, 275 more')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Show 25 more agents' }),
    );
    expect(items()).toHaveLength(50);
    expect(within(items()[49]).getByText('Agent 050')).toBeInTheDocument();
  });

  it('pages within the search, not the whole list', async () => {
    mockAgents = {
      ...mockAgents,
      rows: Array.from({ length: 300 }, (_, i) =>
        row({ name: `Agent ${i + 1}`, technicalName: `agent-${i + 1}` }),
      ),
    };
    await renderPanel('Agent 29');

    // Agent 29 and Agent 290–299: one page, nothing to show more of.
    expect(
      within(screen.getByRole('list', { name: 'Agents' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(11);
    expect(screen.queryByRole('button', { name: /more/ })).toBeNull();
  });

  it('says when the search matches nothing', async () => {
    await renderPanel('zzz');
    expect(screen.getByText('No agents match “zzz”.')).toBeInTheDocument();
  });

  it('shows the loading state, then the empty state', async () => {
    mockAgents = { ...mockAgents, rows: [], isLoading: true };
    const { unmount } = await renderPanel();
    expect(
      await screen.findByLabelText('Reading your agents…'),
    ).toBeInTheDocument();
    unmount();

    mockAgents = { ...mockAgents, isLoading: false };
    await renderPanel();
    expect(screen.getByText('No agents yet')).toBeInTheDocument();
  });

  it('reports the installations it could not read instead of an empty state', async () => {
    mockAgents = { ...mockAgents, rows: [], unreachableInstallations: ['lab'] };
    await renderPanel();
    expect(screen.queryByText('No agents yet')).not.toBeInTheDocument();
    expect(screen.getByText(/lab/)).toBeInTheDocument();
  });

  it('holds the read warning until the read settles, and keeps it closed', async () => {
    // One environment has failed already, the rest are still being read.
    mockAgents = {
      ...mockAgents,
      rows: [],
      isLoading: true,
      unreachableInstallations: ['lab'],
    };
    await renderRerenderablePanel();
    expect(
      await screen.findByLabelText('Reading your agents…'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // The read settles, with that failure as its answer.
    mockAgents = { ...mockAgents, isLoading: false };
    act(() => rerenderPanel());
    expect(
      screen.queryByLabelText('Reading your agents…'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not read 1 environment',
    );

    // Closed, then an environment joins the read and it settles on the same
    // failure: the warning stays closed.
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    mockAgents = { ...mockAgents, isLoading: true };
    act(() => rerenderPanel());
    mockAgents = { ...mockAgents, isLoading: false };
    act(() => rerenderPanel());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('favorites', () => {
    it('stars an agent into a Favorites group above the others, and back', async () => {
      await renderPanel();

      // No favorites: one list, no group headings.
      expect(
        screen.queryByRole('heading', { name: 'Favorites' }),
      ).not.toBeInTheDocument();

      const star = screen.getByRole('button', {
        name: 'Add Release notes to favorites',
      });
      expect(star).toHaveAttribute('aria-pressed', 'false');
      // The star sits beside the row's link, not inside it.
      expect(star.closest('a')).toBeNull();

      await userEvent.click(star);

      const favorites = await screen.findByRole('list', {
        name: 'Favorite agents',
      });
      expect(
        screen.getByRole('heading', { level: 2, name: 'Favorites' }),
      ).toBeInTheDocument();
      expect(within(favorites).getAllByRole('listitem')).toHaveLength(1);
      expect(within(favorites).getByText('Release notes')).toBeInTheDocument();
      const others = screen.getByRole('list', { name: 'Agents' });
      expect(within(others).getAllByRole('listitem')).toHaveLength(1);
      expect(within(others).getByText('Support triage')).toBeInTheDocument();
      // Favorites come first.
      expect(
        favorites.compareDocumentPosition(others) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      await userEvent.click(
        within(favorites).getByRole('button', {
          name: 'Remove Release notes from favorites',
        }),
      );

      await waitFor(() =>
        expect(
          screen.queryByRole('list', { name: 'Favorite agents' }),
        ).not.toBeInTheDocument(),
      );
      expect(
        within(screen.getByRole('list', { name: 'Agents' })).getAllByRole(
          'listitem',
        ),
      ).toHaveLength(2);
    });

    it('shows only the Favorites group when every agent is a favorite', async () => {
      await renderPanel('', await storageWithFavorites([triage, notes]));

      const favorites = await screen.findByRole('list', {
        name: 'Favorite agents',
      });
      expect(within(favorites).getAllByRole('listitem')).toHaveLength(2);
      expect(
        screen.queryByRole('list', { name: 'Agents' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /more/ })).toBeNull();
    });

    it('keeps the search across both groups', async () => {
      await renderPanel('notes', await storageWithFavorites([notes]));

      expect(
        await screen.findByRole('list', { name: 'Favorite agents' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('list', { name: 'Agents' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Support triage')).not.toBeInTheDocument();
    });

    it('windows both groups at 300 agents with 40 favorites', async () => {
      // 40, not 30: five over a page of 25 is within ShowMore's slack and
      // shows whole (live round 2, R9), so 30 would not window the group.
      const rows = manyAgents(300);
      mockAgents = { ...mockAgents, rows };
      await renderPanel('', await storageWithFavorites(rows.slice(0, 40)));

      const favorites = await screen.findByRole('list', {
        name: 'Favorite agents',
      });
      expect(within(favorites).getAllByRole('listitem')).toHaveLength(25);
      expect(
        screen.getByRole('heading', { level: 2, name: 'Favorites' }),
      ).toBeInTheDocument();
      expect(screen.getByText('40 agents')).toBeInTheDocument();
      expect(screen.getByText('260 agents')).toBeInTheDocument();
      expect(
        within(screen.getByRole('list', { name: 'Agents' })).getAllByRole(
          'listitem',
        ),
      ).toHaveLength(25);
      expect(screen.getByText('25 agents shown, 15 more')).toBeInTheDocument();
      expect(screen.getByText('25 agents shown, 235 more')).toBeInTheDocument();
      // Never the whole fleet in the DOM.
      expect(screen.getAllByRole('listitem')).toHaveLength(50);
    });
  });

  describe('last used by you', () => {
    it('shows the agents of the latest sessions as cards opening a new session', async () => {
      const docs = row({ name: 'Docs', technicalName: 'docs' });
      mockAgents = { ...mockAgents, rows: [triage, notes, docs] };
      mockSessions = [
        sessionWith(triage, '2026-10-08T10:00:00Z'),
        sessionWith(docs, '2026-10-09T10:00:00Z'),
        // Not startable: no card.
        sessionWith(notes, '2026-10-10T10:00:00Z'),
      ];
      await renderPanel();

      const strip = screen.getByRole('region', { name: 'Last used by you' });
      const cards = within(strip).getAllByRole('link');
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveTextContent('Docs');
      expect(cards[0]).toHaveAttribute(
        'href',
        `/?agent=${encodeURIComponent(docs.id)}`,
      );
      expect(cards[1]).toHaveTextContent('Support triage');
      expect(cards[1]).toHaveTextContent('Start a session');
    });

    it('shows at most three cards however many sessions there are', async () => {
      const rows = manyAgents(300);
      mockAgents = { ...mockAgents, rows };
      mockSessions = rows.map((each, i) =>
        sessionWith(
          each,
          new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
        ),
      );
      await renderPanel();

      const cards = within(
        screen.getByRole('region', { name: 'Last used by you' }),
      ).getAllByRole('link');
      expect(cards).toHaveLength(3);
      expect(cards[0]).toHaveTextContent('Agent 300');
    });

    it('is left out without sessions, and while searching', async () => {
      await renderPanel();
      expect(
        screen.queryByRole('region', { name: 'Last used by you' }),
      ).not.toBeInTheDocument();

      mockSessions = [sessionWith(triage, '2026-10-08T10:00:00Z')];
      await renderPanel('triage');
      expect(
        screen.queryByRole('region', { name: 'Last used by you' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('helper banner', () => {
    const swarmgeist = row({
      namespace: 'kagent',
      name: 'Swarmgeist',
      technicalName: 'swarmgeist',
    });

    it('is left out while the generalInformation role is unconfigured', async () => {
      await renderPanel();
      expect(
        screen.queryByRole('region', { name: /about agents/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Not sure which agent/),
      ).not.toBeInTheDocument();
    });

    it('points at the configured agent and opens a session with it', async () => {
      mockMetaAgent = swarmgeist;
      await renderPanel();

      const banner = await screen.findByRole('region', {
        name: 'Ask Swarmgeist about agents',
      });
      expect(
        within(banner).getByText(/Describe your task and Swarmgeist suggests/),
      ).toBeInTheDocument();
      expect(
        within(banner).getByRole('link', {
          name: 'Ask Swarmgeist about agents',
        }),
      ).toHaveAttribute('href', `/?agent=${encodeURIComponent(swarmgeist.id)}`);
    });

    it('is left out while the configured agent cannot be started', async () => {
      mockMetaAgent = { ...swarmgeist, readiness: 'failed' };
      await renderPanel();
      expect(
        screen.queryByText(/Not sure which agent/),
      ).not.toBeInTheDocument();
    });

    it('stays away once dismissed', async () => {
      mockMetaAgent = swarmgeist;
      const storage = mockApis.storage();
      const { unmount } = await renderPanel('', storage);

      await userEvent.click(
        await screen.findByRole('button', {
          name: "Dismiss, and don't show this again",
        }),
      );

      await waitFor(() =>
        expect(
          screen.queryByText(/Not sure which agent/),
        ).not.toBeInTheDocument(),
      );
      unmount();

      await renderPanel('', storage);
      expect(
        screen.queryByText(/Not sure which agent/),
      ).not.toBeInTheDocument();
    });
  });
});

describe('CustomizeAgentsPanel at phone width (T22 P2)', () => {
  let layout: MockedLayout;
  const longName =
    'Quarterly_infrastructure_cost_reconciliation_and_reporting_assistant';
  const failing = row({
    name: longName,
    technicalName: 'costs',
    description: 'Reconciles the cloud bills against the budget every quarter',
    model: 'Sonnet 4.5',
    readiness: 'failed',
    readinessMessage: 'Model config sonnet not found',
  });
  const items = () =>
    within(screen.getByRole('list', { name: 'Agents' })).getAllByRole(
      'listitem',
    );

  beforeEach(() => {
    mockAgents = {
      rows: [triage, failing],
      isLoading: false,
      hasInstallations: true,
      unreachableInstallations: [],
    };
    mockSessions = [];
    mockMetaAgent = undefined;
    layout = mockPhoneLayout();
  });
  afterEach(() => layout.restore());

  it('wraps the name, the description and the facts instead of cutting them', async () => {
    await renderPanel();

    const name = screen.getByText(longName);
    // bui truncates on the attribute's presence, whatever its value.
    expect(name).not.toHaveAttribute('data-truncate');
    expect(
      screen.getByText(
        'Reconciles the cloud bills against the budget every quarter',
      ),
    ).not.toHaveAttribute('data-truncate');
    expect(within(items()[0]).getByText('Sonnet 4.5')).not.toHaveAttribute(
      'data-truncate',
    );
  });

  it('keeps a not-Ready agent’s state to its few words; its page says why', async () => {
    const reason =
      'Model config sonnet not found. The agent references a model config that does not exist in its namespace, so the controller cannot render its deployment; create the model config or pick another one.';
    mockAgents = {
      ...mockAgents,
      rows: [triage, { ...failing, readinessMessage: reason }],
    };
    await renderPanel();

    const costs = items().find(item => within(item).queryByText(longName))!;
    expect(within(costs).getByText('Failed')).toBeInTheDocument();
    // The paragraph used to fill two lines of the row.
    expect(within(costs).queryByText(reason)).not.toBeInTheDocument();
    // A Ready agent says nothing extra.
    expect(items()[0]).toHaveTextContent(/Support triageSorts tickets/);
  });

  it('keeps the one-line rows and the tooltip on a wide viewport', async () => {
    layout.restore();
    layout = mockDesktopLayout();
    await renderPanel();

    expect(screen.getByText(longName)).toHaveAttribute('data-truncate', 'true');
    // The reason stays the state's tooltip there.
    expect(
      screen.queryByText('Model config sonnet not found'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Failed').parentElement).toHaveAttribute(
      'title',
      'Model config sonnet not found',
    );
  });

  it('stars an agent from the row on a phone', async () => {
    await renderPanel();

    await userEvent.click(
      screen.getByRole('button', { name: `Add ${longName} to favorites` }),
    );
    const favorites = await screen.findByRole('list', {
      name: 'Favorite agents',
    });
    expect(within(favorites).getByText(longName)).toBeInTheDocument();
  });

  it('shows three agents with no paging chrome', async () => {
    mockAgents = { ...mockAgents, rows: manyAgents(3) };
    await renderPanel();

    expect(items()).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /more|fewer/i })).toBeNull();
    expect(screen.queryByText(/shown/)).toBeNull();
  });

  it('windows 300 agents, 25 at a time', async () => {
    mockAgents = { ...mockAgents, rows: manyAgents(300) };
    await renderPanel();

    expect(items()).toHaveLength(25);
    expect(screen.getByText('25 agents shown, 275 more')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Show 25 more agents' }),
    );
    expect(items()).toHaveLength(50);
  });
});

describe('CustomizeAgentsPanel filters (T49, T64)', () => {
  /** A filter's dropdown; `hidden` keeps it readable while its list is open. */
  const filterDropdown = (field: string) =>
    screen.getByRole('button', {
      name: new RegExp(`Filter by ${field}`),
      hidden: true,
    });
  /** A filter dropdown's options, as "label count", read and closed again. */
  const filterOptions = async (field: string) => {
    await userEvent.click(filterDropdown(field));
    const options = within(await screen.findByRole('listbox'))
      .getAllByRole('option')
      .map(option => option.textContent);
    await userEvent.keyboard('{Escape}');
    return options;
  };
  /** Toggles one option of a filter dropdown. */
  const pickFilter = async (field: string, option: string) => {
    await userEvent.click(filterDropdown(field));
    await userEvent.click(await screen.findByRole('option', { name: option }));
    await userEvent.keyboard('{Escape}');
  };
  const listed = (name = 'Agents') =>
    within(screen.getByRole('list', { name })).getAllByRole('listitem');

  beforeEach(() => {
    mockSessions = [];
    mockMetaAgent = undefined;
  });

  it('offers the model dropdown over three agents on one model, none starred', async () => {
    mockAgents = {
      rows: [
        row({ name: 'A', technicalName: 'a', model: 'Sonnet 4.5' }),
        row({ name: 'B', technicalName: 'b', model: 'Sonnet 4.5' }),
        row({ name: 'C', technicalName: 'c', model: 'Sonnet 4.5' }),
      ],
      isLoading: false,
      hasInstallations: true,
      unreachableInstallations: [],
    };
    await renderPanel();

    expect(listed()).toHaveLength(3);
    // One model is still a dropdown, of one option (T64); nothing starred is
    // nothing to offer.
    expect(await filterOptions('model')).toEqual(['Sonnet 4.5 3']);
    expect(
      screen.queryByRole('button', { name: /Filter by favorites/ }),
    ).not.toBeInTheDocument();
  });

  it('filters three agents by model and by favorites, hiding the recent cards', async () => {
    const opus = row({ name: 'Opus agent', technicalName: 'o', model: 'Opus' });
    mockAgents = {
      rows: [triage, { ...notes, model: 'Sonnet 4.5' }, opus],
      isLoading: false,
      hasInstallations: true,
      unreachableInstallations: [],
    };
    mockSessions = [sessionWith(triage, '2026-10-08T10:00:00Z')];
    await renderPanel('', await storageWithFavorites([opus]));

    expect(
      await screen.findByRole('region', { name: 'Last used by you' }),
    ).toBeInTheDocument();
    expect(await filterOptions('model')).toEqual(['Sonnet 4.5 2', 'Opus 1']);
    expect(await filterOptions('favorites')).toEqual(['Starred 1']);

    await pickFilter('model', 'Sonnet 4.5 2');
    expect(listed().map(item => item.textContent)).toEqual([
      expect.stringContaining('Support triage'),
      expect.stringContaining('Release notes'),
    ]);
    // The favorites count follows the model pick.
    expect(await filterOptions('favorites')).toEqual(['Starred 0']);
    expect(
      screen.queryByRole('region', { name: 'Last used by you' }),
    ).not.toBeInTheDocument();

    await pickFilter('favorites', 'Starred 0');
    expect(
      screen.getByText('No agents match these filters.'),
    ).toBeInTheDocument();
    // A second model widens the list to the starred Opus agent.
    await pickFilter('model', 'Opus 1');
    expect(listed('Favorite agents')).toHaveLength(1);

    await userEvent.click(
      within(screen.getByRole('group', { name: 'Filters' })).getByRole(
        'button',
        { name: 'Clear filters' },
      ),
    );
    expect(screen.getByRole('list', { name: 'Favorite agents' })).toBeVisible();
    expect(listed()).toHaveLength(2);
  });

  it('offers the favorites filter once something is starred', async () => {
    mockAgents = {
      rows: [triage, notes],
      isLoading: false,
      hasInstallations: true,
      unreachableInstallations: [],
    };
    await renderPanel();
    expect(
      screen.queryByRole('button', { name: /Filter by favorites/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Add Release notes to favorites' }),
    );

    expect(
      await screen.findByRole('button', { name: /Filter by favorites/ }),
    ).toBeInTheDocument();
    await pickFilter('favorites', 'Starred 1');
    expect(listed('Favorite agents')).toHaveLength(1);
    expect(
      screen.queryByRole('list', { name: 'Agents' }),
    ).not.toBeInTheDocument();
  });

  describe('Harness (main #2858)', () => {
    const onHarness = (harness: string, harnessTitle?: string) => ({
      harness,
      ...(harnessTitle && { harnessTitle }),
    });

    it('shows neither the Harness nor its filter while every agent shares one', async () => {
      mockAgents = {
        rows: [
          row({ name: 'A', technicalName: 'a', model: 'Sonnet 4.5' }),
          row({ name: 'B', technicalName: 'b', model: 'Sonnet 4.5' }),
          row({ name: 'C', technicalName: 'c', model: 'Sonnet 4.5' }),
        ].map(each => ({
          ...each,
          ...onHarness('claude-code', 'Claude Code'),
        })),
        isLoading: false,
        hasInstallations: true,
        unreachableInstallations: [],
      };
      await renderPanel();

      expect(listed()).toHaveLength(3);
      // The singleHarness rule: no dropdown of one, unlike Model.
      expect(filterDropdown('model')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Filter by harness/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Claude Code')).not.toBeInTheDocument();
    });

    it('shows the Harness of each agent and filters three agents by it', async () => {
      mockAgents = {
        rows: [
          { ...triage, ...onHarness('claude-code', 'Claude Code') },
          { ...notes, ...onHarness('claude-code', 'Claude Code') },
          // Its Harness not read yet: the name stands in for the title.
          row({ name: 'Coder', technicalName: 'coder', ...onHarness('codex') }),
        ],
        isLoading: false,
        hasInstallations: true,
        unreachableInstallations: [],
      };
      await renderPanel();

      const [first, , third] = listed();
      expect(within(first).getByText('Claude Code')).toHaveAttribute(
        'title',
        'Harness: Claude Code (claude-code)',
      );
      expect(within(third).getByText('codex')).toHaveAttribute(
        'title',
        'Harness: codex',
      );
      expect(await filterOptions('harness')).toEqual([
        'Claude Code (claude-code) 2',
        'codex 1',
      ]);

      await pickFilter('harness', 'codex 1');
      expect(listed().map(item => item.textContent)).toEqual([
        expect.stringContaining('Coder'),
      ]);
      expect(filterDropdown('harness')).toHaveTextContent('codex');
    });

    it('picks a Harness at 300 agents, paging from the first page', async () => {
      const titles = ['Claude Code', 'Codex', 'Gemini'];
      mockAgents = {
        rows: manyAgents(300).map((each, index) => ({
          ...each,
          ...onHarness(
            titles[index % 3].toLowerCase().replace(' ', '-'),
            titles[index % 3],
          ),
        })),
        isLoading: false,
        hasInstallations: true,
        unreachableInstallations: [],
      };
      await renderPanel();

      expect(listed()).toHaveLength(25);
      expect(await filterOptions('harness')).toEqual([
        'Claude Code (claude-code) 100',
        'Codex (codex) 100',
        'Gemini (gemini) 100',
      ]);

      await pickFilter('harness', 'Gemini (gemini) 100');
      expect(listed()).toHaveLength(25);
      expect(
        listed().every(item => within(item).queryByText('Gemini') !== null),
      ).toBe(true);
      await userEvent.click(
        screen.getByRole('button', { name: 'Show 25 more agents' }),
      );
      expect(listed()).toHaveLength(50);
    });
  });

  it('picks several of many models at 300 agents, paging from the first page', async () => {
    mockAgents = {
      rows: manyAgents(300).map((each, index) => ({
        ...each,
        model: `Model ${String(index % 12).padStart(2, '0')}`,
      })),
      isLoading: false,
      hasInstallations: true,
      unreachableInstallations: [],
    };
    await renderPanel();

    await userEvent.click(
      screen.getByRole('button', { name: 'Show 25 more agents' }),
    );
    expect(listed()).toHaveLength(50);

    const models = await filterOptions('model');
    expect(models).toHaveLength(12);
    expect(models[0]).toBe('Model 00 25');

    await pickFilter('model', 'Model 03 25');
    // 25 agents on Model 03: one page, shown whole.
    expect(listed()).toHaveLength(25);
    expect(screen.queryByRole('button', { name: /more/ })).toBeNull();

    // Model 04 too: 50 agents, paged again from the first page.
    await pickFilter('model', 'Model 04 25');
    expect(listed()).toHaveLength(25);
    expect(
      screen.getByRole('button', { name: 'Show 25 more agents' }),
    ).toBeInTheDocument();
    expect(filterDropdown('model')).toHaveTextContent(
      'Model 2Model 03 and Model 04',
    );
  });
});
