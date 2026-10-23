import { type ReactNode, useState } from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { storageApiRef, type StorageApi } from '@backstage/core-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import {
  type MockedLayout,
  mockDesktopLayout,
  mockPhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import type { InstallationInventoryEntry } from '@giantswarm/backstage-plugin-gs';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';
import type { AgentRow, AgentsContextValue } from '../AgentsDataProvider';
import type { SessionRow } from '../SessionsDataProvider/helpers';
import {
  agentsRouteRef,
  installationsExternalRouteRef,
  newSessionExternalRouteRef,
} from '../../routes';
import { CustomizeAgentsPanel } from './CustomizeAgentsPanel';

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => undefined,
}));
// The inventory behind what `useAgents` says about kagent and which
// environment's failure the gate explains. The gate itself, covered by its
// own tests in gs, renders a marker naming it.
let mockInventoryEntries: InstallationInventoryEntry[] = [];
let mockAgents: Partial<AgentsContextValue>;
// What `useAgents` says about the inventory (`kagentMissing`,
// `kagentSwitchedOff`, `unknownPin`, `inventoryFailure`) follows the mocked
// inventory and rows by the provider's own selectors.
jest.mock('../AgentsDataProvider', () => {
  const helpers = jest.requireActual('../AgentsDataProvider/helpers');
  const gs = jest.requireActual('@giantswarm/backstage-plugin-gs');
  return {
    describeKagentSwitchedOff: helpers.describeKagentSwitchedOff,
    useAgents: () => {
      const scope = mockAgents.scope ?? 'all';
      const rows = mockAgents.rows ?? [];
      const inventory = {
        entries: mockInventoryEntries,
        home: mockInventoryEntries.find(entry => entry.home)?.installation,
        isLoading: false,
      };
      const unknownPin = helpers.selectUnknownPin(inventory, scope);
      return {
        kagentMissing:
          rows.length === 0
            ? helpers.selectKagentMissing(mockInventoryEntries, scope)
            : undefined,
        kagentSwitchedOff: gs.installationsSwitchedOffWithComponent(
          mockInventoryEntries,
          scope,
          'kagent',
        ),
        unknownPin,
        inventoryFailure: helpers.selectAgentsInventoryFailure(
          inventory,
          scope,
          {
            unknownPin,
            listsNothing:
              !mockAgents.isLoading &&
              rows.length === 0 &&
              (mockAgents.installations ?? []).length === 0,
          },
        ),
        noAccessInstallations: [],
        ...mockAgents,
      };
    },
  };
});
// The person as agent-manager names a creator, on every installation: whom
// "created by me" compares an agent's creator with.
const mockCaller = 'me@example.com';
jest.mock('../../hooks/useKagentCapabilities', () => ({
  useKagentCapabilitiesMap: () => () => ({
    isUserScoped: true,
    caller: mockCaller,
  }),
}));
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs'),
  useInstallationInventory: () => ({ refresh: () => {} }),
  InventoryFailureGate: ({
    failure,
  }: {
    failure: { installation: string };
  }) => <div>Inventory gate: {failure.installation}</div>,
}));
function environment(
  installation: string,
  overrides: Partial<InstallationInventoryEntry> & { kagent?: boolean } = {},
): InstallationInventoryEntry {
  const { kagent = true, ...rest } = overrides;
  return {
    installation,
    home: false,
    accessState: 'healthy',
    muted: false,
    probe: 'answered',
    components: { kagent, muster: true, kserve: false, capi: true },
    ...rest,
  };
}
beforeEach(() => {
  mockInventoryEntries = [environment('golem', { home: true })];
});
const failedProbe = (name: string) => Object.assign(new Error(name), { name });

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

function renderPanel(
  search = '',
  storage: StorageApi = mockApis.storage(),
  musterApi?: MusterApi,
) {
  const panel = (
    // The first-agent card asks agent-manager where the person may create.
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CustomizeAgentsPanel search={search} />
    </QueryClientProvider>
  );
  return renderInTestApp(
    musterApi ? (
      <TestApiProvider apis={[[musterApiRef, musterApi]]}>
        {panel}
      </TestApiProvider>
    ) : (
      panel
    ),
    {
      mountedRoutes: {
        '/': newSessionExternalRouteRef,
        '/customize/agents': agentsRouteRef,
        '/installations': installationsExternalRouteRef,
      },
      apis: [[storageApiRef, storage]],
    },
  );
}

/**
 * muster on each installation named, reaching agent-manager as the person,
 * whose `get_info` names `managed`: the tenants the person may create agents
 * in there.
 */
function musterWhereCreatableIn(managed: Record<string, string[]>): MusterApi {
  return {
    listInstallations: async () => ({
      installations: Object.keys(managed).map(name => ({
        name,
        requiresAuth: true,
      })),
    }),
    listServers: async () => ({ mcpServers: [{ name: 'agent-manager' }] }),
    callTool: async (name: string, _args: unknown, installation: string) => {
      if (name !== 'x_agent-manager_get_info') {
        throw new Error(`unexpected tool ${name}`);
      }
      return {
        namespaces: { default: 'kagent', managed: managed[installation] },
      };
    },
  } as unknown as MusterApi;
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
  return renderInTestApp(
    <QueryClientProvider client={new QueryClient()}>
      <RerenderablePanel />
    </QueryClientProvider>,
    {
      mountedRoutes: {
        '/': newSessionExternalRouteRef,
        '/customize/agents': agentsRouteRef,
      },
      apis: [[storageApiRef, mockApis.storage()]],
    },
  );
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
      scope: 'all',
      installations: ['golem'],
      isLoading: false,
      isLoadingMore: false,
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

    // The name is the link; its hit area covers the row.
    const triageLink = within(items[0]).getByRole('link', {
      name: 'Support triage',
    });
    expect(triageLink).toHaveAttribute(
      'href',
      '/customize/agents/golem/support/triage',
    );
    const triageRow = items[0];
    expect(within(triageRow).getByText('Sorts tickets')).toBeInTheDocument();
    expect(within(triageRow).getByText('Sonnet 4.5')).toBeInTheDocument();
    expect(
      within(triageRow).getByText('2 skills · 2 connectors'),
    ).toBeInTheDocument();
    expect(within(triageRow).queryByText('support')).not.toBeInTheDocument();
    // A Ready agent shows no state; one that needs a look says so inline.
    expect(within(triageRow).queryByText('Ready')).not.toBeInTheDocument();
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
    expect(
      screen.getByRole('heading', { name: 'No agents yet' }),
    ).toBeInTheDocument();
  });

  it('reports the installations it could not read instead of an empty state', async () => {
    mockAgents = { ...mockAgents, rows: [], unreachableInstallations: ['lab'] };
    await renderPanel();
    expect(screen.queryByText('No agents yet')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Create your first agent' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/lab/)).toBeInTheDocument();
  });

  describe('empty and incomplete lists (A25)', () => {
    it('invites creating the first agent where the fleet answered with none', async () => {
      mockAgents = { ...mockAgents, rows: [] };
      await renderPanel();

      expect(
        screen.getByRole('heading', { name: 'No agents yet' }),
      ).toBeInTheDocument();
      expect(screen.getByText(/An agent is an assistant/)).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Create your first agent' }),
      ).toHaveAttribute('href', '/customize/agents/new');
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('says who grants access where no organization binds the person, instead of inviting a first agent', async () => {
      mockAgents = {
        ...mockAgents,
        rows: [],
        noAccessInstallations: ['golem'],
      };
      await renderPanel();

      expect(
        screen.getByRole('heading', { name: 'No agents for you yet' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /no agents on golem\. Access to agents is granted per organization: .*agent-platform:user/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Create your first agent' }),
      ).not.toBeInTheDocument();
    });

    it.each([
      ['in no tenant', [], 'No agents for you yet', false],
      ['in a tenant', ['org-acme'], 'No agents yet', true],
    ])(
      'follows where the person may create, though every tenant answered: %s',
      async (_case, managed, title, invited) => {
        // The platform tenant answers everyone (bound to all authenticated
        // people), so nothing was refused; agent-manager decides the offer.
        mockAgents = { ...mockAgents, rows: [], noAccessInstallations: [] };
        await renderPanel(
          '',
          mockApis.storage(),
          musterWhereCreatableIn({ golem: managed }),
        );

        expect(
          await screen.findByRole('heading', { name: title }),
        ).toBeInTheDocument();
        expect(
          screen.queryAllByRole('link', { name: 'Create your first agent' }),
        ).toHaveLength(invited ? 1 : 0);
        expect(
          screen.queryAllByText(/agent-platform:user.*agent-platform:editor/),
        ).toHaveLength(invited ? 0 : 1);
      },
    );

    it('invites creating where the person may, though another environment refused every tenant', async () => {
      mockAgents = {
        ...mockAgents,
        rows: [],
        installations: ['golem', 'lab'],
        noAccessInstallations: ['golem'],
      };
      await renderPanel(
        '',
        mockApis.storage(),
        musterWhereCreatableIn({ lab: ['org-acme'] }),
      );

      expect(
        await screen.findByRole('link', { name: 'Create your first agent' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('No agents for you yet'),
      ).not.toBeInTheDocument();
    });

    it('says when no environments are configured', async () => {
      mockInventoryEntries = [];
      mockAgents = {
        ...mockAgents,
        rows: [],
        installations: [],
        hasInstallations: false,
      };
      await renderPanel();

      expect(
        screen.getByRole('heading', { name: 'No environments configured' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Create your first agent' }),
      ).not.toBeInTheDocument();
    });

    it('says a pinned environment has no kagent, while the rest still loads', async () => {
      mockInventoryEntries = [
        environment('golem'),
        environment('dingo', { kagent: false }),
      ];
      mockAgents = {
        ...mockAgents,
        rows: [],
        scope: 'dingo',
        installations: [],
        isLoading: true,
      };
      await renderPanel();

      expect(
        screen.getByRole('heading', {
          name: 'kagent is not installed on dingo',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Agents run on environments with kagent. Choose another environment, or enable the Agent Platform on dingo.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Go to Installations' }),
      ).toHaveAttribute('href', '/installations');
      expect(
        screen.queryByLabelText('Reading your agents…'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('No agents yet')).not.toBeInTheDocument();
    });

    it('names the only environment when it has no kagent, with no other to choose', async () => {
      mockInventoryEntries = [environment('golem', { kagent: false })];
      mockAgents = { ...mockAgents, rows: [], installations: [] };
      await renderPanel();

      expect(
        screen.getByRole('heading', {
          name: 'kagent is not installed on golem',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Agents run on environments with kagent. Enable the Agent Platform on golem to create agents there.',
        ),
      ).toBeInTheDocument();
    });

    it('says when no environment runs kagent under All environments', async () => {
      mockInventoryEntries = [
        environment('golem', { kagent: false }),
        environment('dingo', { kagent: false }),
        // Switched off in the sidebar, and without kagent either.
        environment('lab', { muted: true, kagent: false }),
      ];
      mockAgents = { ...mockAgents, rows: [], installations: [] };
      await renderPanel();

      expect(
        screen.getByRole('heading', {
          name: 'kagent is not installed on any environment',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Go to Installations' }),
      ).toBeInTheDocument();
    });

    it('does not invite creating an agent where no environment in reach runs kagent', async () => {
      // golem answered without kagent; lab runs it but its access is down, so
      // the create flow has nowhere to deploy to.
      mockInventoryEntries = [
        environment('golem', { kagent: false }),
        environment('lab', { accessState: 'degraded', probe: 'pending' }),
      ];
      mockAgents = { ...mockAgents, rows: [], installations: [] };
      await renderPanel();

      expect(
        screen.getByRole('heading', { name: 'No agents to list' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText('No environment this portal can reach runs kagent.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('No agents yet')).not.toBeInTheDocument();
      expect(screen.queryByText(/is not installed/)).not.toBeInTheDocument();
    });

    it('leaves an environment that could not be asked to the inventory gate', async () => {
      mockInventoryEntries = [
        environment('golem', {
          home: true,
          probe: 'failed',
          error: failedProbe('UnauthorizedError'),
        }),
      ];
      mockAgents = { ...mockAgents, rows: [], installations: [] };
      await renderPanel();

      expect(screen.getByText('Inventory gate: golem')).toBeInTheDocument();
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });

    it('explains an empty list by an environment other than home that could not be asked', async () => {
      // The home answered without kagent; dingo might run it, but its probe
      // was refused, so it is the only explanation of the empty list.
      mockInventoryEntries = [
        environment('golem', { home: true, kagent: false }),
        environment('dingo', {
          probe: 'failed',
          error: failedProbe('ForbiddenError'),
        }),
      ];
      mockAgents = { ...mockAgents, rows: [], installations: [] };
      await renderPanel();

      expect(screen.getByText('Inventory gate: dingo')).toBeInTheDocument();
      expect(screen.queryByText('No agents to list')).not.toBeInTheDocument();
      expect(screen.queryByText(/is not installed/)).not.toBeInTheDocument();
    });

    it('keeps the gate to the home environment while the list has rows', async () => {
      mockInventoryEntries = [
        environment('golem', { home: true }),
        environment('dingo', {
          probe: 'failed',
          error: failedProbe('ForbiddenError'),
        }),
      ];
      await renderPanel();

      expect(screen.getByText('Support triage')).toBeInTheDocument();
      expect(screen.queryByText(/Inventory gate/)).not.toBeInTheDocument();
    });

    it('says a pinned environment is unknown, instead of blaming another one', async () => {
      mockInventoryEntries = [
        environment('golem', {
          home: true,
          probe: 'failed',
          error: failedProbe('UnauthorizedError'),
        }),
        environment('dingo'),
      ];
      mockAgents = {
        ...mockAgents,
        rows: [],
        scope: 'old-lab',
        installations: [],
      };
      await renderPanel();

      expect(
        screen.getByRole('heading', { name: 'Unknown environment' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'This portal knows no environment named “old-lab”. Choose another environment.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Inventory gate/)).not.toBeInTheDocument();
      expect(screen.queryByText('No agents to list')).not.toBeInTheDocument();
    });

    it('names an environment switched off in Cluster access that runs kagent', async () => {
      mockInventoryEntries = [
        environment('golem', { home: true, kagent: false }),
        environment('lab', { muted: true }),
      ];
      mockAgents = { ...mockAgents, rows: [], installations: [] };
      await renderPanel();

      expect(
        screen.getByRole('heading', { name: 'No agents to list' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'lab runs kagent but is switched off in Cluster access, so its agents are not read.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/is not installed/)).not.toBeInTheDocument();
    });

    it('shows a thin bar while more environments are still read, over the same list', async () => {
      mockAgents = { ...mockAgents, isLoadingMore: true };
      await renderRerenderablePanel();

      const list = screen.getByRole('list', { name: 'Agents' });
      expect(within(list).getByText('Support triage')).toBeInTheDocument();
      expect(
        await screen.findByRole('progressbar', { name: 'Loading more agents' }),
      ).toBeInTheDocument();

      // The last environment answers: the bar goes, the list stays mounted.
      mockAgents = { ...mockAgents, isLoadingMore: false };
      act(() => rerenderPanel());
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Agents' })).toBe(list);
    });
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
    it('shows the agents of the latest sessions as cards opening their page', async () => {
      const docs = row({ name: 'Docs', technicalName: 'docs' });
      mockAgents = { ...mockAgents, rows: [triage, notes, docs] };
      mockSessions = [
        sessionWith(triage, '2026-10-08T10:00:00Z'),
        sessionWith(docs, '2026-10-09T10:00:00Z'),
        // Failed since: still a card, since its page says why.
        sessionWith(notes, '2026-10-10T10:00:00Z'),
      ];
      await renderPanel();

      const strip = screen.getByRole('region', { name: 'Last used by you' });
      const cards = within(strip).getAllByRole('link');
      expect(cards).toHaveLength(3);
      // The name is the link, as on the list's rows, and opens the agent's
      // page like every other item of the list: it is where a session
      // starts, with Use this agent.
      expect(cards[0]).toHaveAccessibleName('Release notes');
      expect(cards[0]).toHaveAttribute(
        'href',
        '/customize/agents/golem/engineering/notes',
      );
      expect(cards[1]).toHaveAccessibleName('Docs');
      expect(cards[1]).toHaveAttribute(
        'href',
        `/customize/agents/${docs.installation}/${docs.namespace}/docs`,
      );
      expect(cards[2]).toHaveAccessibleName('Support triage');
      expect(cards[2]).toHaveAttribute(
        'href',
        '/customize/agents/golem/support/triage',
      );
      expect(strip).not.toHaveTextContent('Start a session');
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

  it('filters by organization and by who created the agent, each row naming its organization', async () => {
    mockAgents = {
      rows: [
        row({
          name: 'SRE',
          technicalName: 'sre',
          namespace: 'kagent',
          tenant: 'None',
        }),
        row({
          name: 'Billing',
          technicalName: 'billing',
          namespace: 'org-acme',
          tenant: 'acme',
          createdBy: mockCaller,
        }),
        row({
          name: 'Sales',
          technicalName: 'sales',
          namespace: 'org-acme',
          tenant: 'acme',
          createdBy: 'other@example.com',
        }),
      ],
      isLoading: false,
      hasInstallations: true,
      unreachableInstallations: [],
    };
    await renderPanel();

    // The platform's agent belongs to no organization: None, and a hint
    // that says it is available to all of them, a button of its own beside
    // the row's link, which the keyboard reaches.
    const sre = listed()[0];
    expect(sre).toHaveTextContent('None');
    expect(sre).not.toHaveTextContent('Platform');
    const hint = within(sre).getByRole('button', { name: 'What None means' });
    expect(hint.closest('a')).toBeNull();
    // In the tab order; its text is `OrganizationValue`'s own test.
    expect(hint.tabIndex).toBeGreaterThanOrEqual(0);
    expect(
      within(listed()[1]).queryByRole('button', { name: /None/ }),
    ).toBeNull();
    expect(await filterOptions('organization')).toEqual(['acme 2', 'None 1']);
    expect(await filterOptions('created by')).toEqual(['Me 1']);

    await pickFilter('created by', 'Me 1');
    expect(listed().map(item => item.textContent)).toEqual([
      expect.stringContaining('Billing'),
    ]);
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
