import { type ReactNode, useState } from 'react';
import { StorageApi, storageApiRef } from '@backstage/core-plugin-api';
import { identityApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  applyInstallationScope,
  installationsSwitchedOffWithComponent,
  installationsWithComponent,
  type InstallationInventoryEntry,
  type InstallationScope,
} from '@giantswarm/backstage-plugin-gs';
import {
  agentsRouteRef,
  installationsExternalRouteRef,
  sessionsRouteRef,
} from '../../routes';
import type { AgentRow, AgentsContextValue } from '../AgentsDataProvider';
import {
  selectAgentsInventoryFailure,
  selectKagentMissing,
  selectUnknownPin,
} from '../AgentsDataProvider/helpers';
import type { SessionRow } from '../SessionsDataProvider/helpers';
import { AgentPlatformHome } from './AgentPlatformHome';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => 'https://avatars.example/agent.png',
}));

function mockPassThrough({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

jest.mock('../AgentPlatformCookieAuth', () => ({
  AgentPlatformCookieAuth: mockPassThrough,
}));
jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: mockPassThrough,
}));
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: mockPassThrough,
}));
jest.mock('../ServingProvider', () => ({
  ServingProvider: mockPassThrough,
}));

jest.mock('../InstallationScopeNote', () => ({
  InstallationScopeNote: () => <div data-testid="installation-scope-note" />,
}));
let mockSlackConfigured = false;
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs-react'),
  useSignedInConfig: () => ({
    config: {
      getOptionalBoolean: (key: string) =>
        key === 'agentPlatform.integrations.slack'
          ? mockSlackConfigured
          : undefined,
      getOptionalString: () => undefined,
    },
    isLoading: false,
  }),
}));
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs'),
  useInstallationInventory: () => ({ refresh: () => {} }),
  // The gate itself, covered by its own tests in gs, renders a marker naming
  // the environment it explains.
  InventoryFailureGate: ({
    failure,
  }: {
    failure: { installation: string };
  }) => (
    <div data-testid="inventory-gate">
      Inventory gate: {failure.installation}
    </div>
  ),
}));

const mockUseAgents = jest.fn<AgentsContextValue, []>();
jest.mock('../AgentsDataProvider', () => ({
  ...jest.requireActual('../AgentsDataProvider'),
  AgentsDataProvider: mockPassThrough,
  useAgents: () => mockUseAgents(),
}));

const mockSessions = jest.fn<SessionRow[], []>(() => []);
jest.mock('../SessionsDataProvider', () => ({
  SessionsDataProvider: mockPassThrough,
  useSessions: () => ({ rows: mockSessions() }),
}));

// The catalogue that names individually picked tools by connector; the reach
// line's own suite covers the coverage words (T103).
jest.mock('../../hooks/useReachCatalogue', () => ({
  useReachCatalogue: () => undefined,
}));

const mockUseCreateSession = jest.fn();
jest.mock('../../hooks/useCreateSession', () => ({
  useCreateSession: (entryPoint: string) => mockUseCreateSession(entryPoint),
}));

const sre: AgentRow = {
  id: 'gazelle/kagent/sre-agent',
  installation: 'gazelle',
  namespace: 'kagent',
  name: 'SRE Agent',
  technicalName: 'sre-agent',
  description: 'Investigates incidents',
  skillCount: 3,
  readiness: 'ready',
};

const research: AgentRow = {
  ...sre,
  id: 'gazelle/research/research-agent',
  namespace: 'research',
  name: 'Research Agent',
  technicalName: 'research-agent',
  description: 'Finds things out',
  model: 'Sonnet 4.5',
  toolset: {
    state: 'declared',
    carrier: 'research-agent',
    selectors: ['server:confluence', 'server:slack'],
  },
};

const docs: AgentRow = {
  ...sre,
  id: 'gazelle/kagent/docs-agent',
  name: 'Docs Agent',
  technicalName: 'docs-agent',
};

function sessionWith(agent: AgentRow, createdAt: string): SessionRow {
  return {
    id: `gazelle/${agent.technicalName}-${createdAt}`,
    sessionId: `${agent.technicalName}-${createdAt}`,
    installation: agent.installation,
    title: 'Chat',
    agentName: agent.name,
    agentTechnicalName: agent.technicalName,
    agentNamespace: agent.namespace,
    createdAt,
  };
}

const loadedAgents: AgentsContextValue = {
  rows: [sre],
  scope: 'all',
  installations: ['gazelle'],
  isLoading: false,
  isLoadingMore: false,
  hasInstallations: true,
  unreachableInstallations: [],
  kagentMissing: undefined,
  kagentSwitchedOff: [],
  unknownPin: undefined,
  inventoryFailure: undefined,
};

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

/**
 * What `useAgents` answers once the fleet settled with no agent and the
 * inventory holding `entries`, by the provider's own rules.
 */
function agentsOver(
  entries: InstallationInventoryEntry[],
  scope: InstallationScope = 'all',
): AgentsContextValue {
  const installations = applyInstallationScope(
    installationsWithComponent(entries, 'kagent'),
    scope,
  );
  const unknownPin = selectUnknownPin({ entries, isLoading: false }, scope);
  return {
    ...loadedAgents,
    rows: [],
    scope,
    installations,
    hasInstallations: entries.length > 0,
    kagentMissing: selectKagentMissing(entries, scope),
    kagentSwitchedOff: installationsSwitchedOffWithComponent(
      entries,
      scope,
      'kagent',
    ),
    unknownPin,
    inventoryFailure: selectAgentsInventoryFailure(
      { entries, home: entries.find(entry => entry.home)?.installation },
      scope,
      { unknownPin, listsNothing: installations.length === 0 },
    ),
  };
}

const failedProbe = (name: string) => Object.assign(new Error(name), { name });

// Re-render the home from inside the test app (its own `rerender` would drop
// the app around it), so a test can change what `useAgents` answers and watch
// one mounted page follow.
let rerenderHome: () => void = () => {};
function RerenderableHome(props: { manageAgentsHref?: string }) {
  const [, setTick] = useState(0);
  rerenderHome = () => setTick(tick => tick + 1);
  return <AgentPlatformHome {...props} />;
}

function render({
  bound = true,
  displayName = 'Jane Doe',
  manageAgentsHref,
  url,
  rerenderable = false,
  storage = mockApis.storage(),
}: {
  bound?: boolean;
  displayName?: string;
  manageAgentsHref?: string;
  /** The URL the home opens at, e.g. with `?agent=`. */
  url?: string;
  /** Mount it so `rerenderHome` can re-render it in place. */
  rerenderable?: boolean;
  /** What the person has stored, e.g. their favorite agents. */
  storage?: StorageApi;
} = {}) {
  return renderInTestApp(
    rerenderable ? (
      <RerenderableHome manageAgentsHref={manageAgentsHref} />
    ) : (
      <AgentPlatformHome manageAgentsHref={manageAgentsHref} />
    ),
    {
      ...(url && { initialRouteEntries: [url] }),
      apis: [
        [
          identityApiRef,
          mockApis.identity.mock({
            getProfileInfo: async () => ({ displayName }),
          }),
        ],
        [storageApiRef, storage],
      ],
      ...(bound && {
        mountedRoutes: {
          '/agent-platform/sessions': sessionsRouteRef,
          '/agent-platform/agents': agentsRouteRef,
          '/installations': installationsExternalRouteRef,
        },
      }),
    },
  );
}

const agentPicker = () =>
  screen
    .getAllByRole('button')
    .find(button => button.getAttribute('aria-haspopup') === 'listbox')!;

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 9, 8, 15, 0), advanceTimers: true });
  window.localStorage.clear();
  mockNavigate.mockClear();
  mockUseAgents.mockClear();
  mockUseCreateSession.mockReset();
  mockUseCreateSession.mockReturnValue({
    createSession: jest.fn(),
    isCreating: false,
    error: null,
    reset: jest.fn(),
  });
  mockUseAgents.mockReturnValue(loadedAgents);
  mockSessions.mockReturnValue([]);
  mockSlackConfigured = false;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AgentPlatformHome', () => {
  it('greets the signed-in person by first name', async () => {
    await render();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Good afternoon, Jane',
      }),
    ).toBeInTheDocument();
  });

  it('names itself in the document title, as the rail does', async () => {
    // Live round 2 (R5): Home set no title, so arriving from another page
    // kept that page's.
    await render();

    await waitFor(() => expect(document.title).toBe('New session'));
  });

  it('greets without a name when the profile has none', async () => {
    await render({ displayName: '' });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Good afternoon' }),
    ).toBeInTheDocument();
  });

  it('renders the expanded composer, reporting sessions as started from home', async () => {
    await render();

    expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveAttribute(
      'rows',
      '3',
    );
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(mockUseCreateSession).toHaveBeenCalledWith('home');
  });

  it('centers the whole block in the content area, clear of the mobile bar', async () => {
    await render();

    const wrapper = document.querySelector('[class*="centered"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper).toContainElement(
      screen.getByRole('heading', { level: 1, name: /Good afternoon/ }),
    );
    expect(wrapper).toHaveStyle({
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    });
  });

  it('says which installation scope the composer reads', async () => {
    await render();

    expect(screen.getByTestId('installation-scope-note')).toBeInTheDocument();
    expect(screen.queryByTestId('inventory-gate')).not.toBeInTheDocument();
  });

  it('explains an environment that could not be asked whether it runs kagent', async () => {
    mockUseAgents.mockReturnValue({
      ...loadedAgents,
      inventoryFailure: {
        installation: 'gazelle',
        kind: 'forbidden',
        error: failedProbe('ForbiddenError'),
      },
    });
    await render();

    expect(screen.getByText('Inventory gate: gazelle')).toBeInTheDocument();
    // The agents that could be read are still offered.
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeInTheDocument();
  });

  it('leaves the Slack promo out on a portal that has not enabled it', async () => {
    await render();

    expect(
      screen.queryByRole('region', { name: 'Use agents in Slack' }),
    ).not.toBeInTheDocument();
  });

  it('places the Slack promo under the composer, as the Main artboard does', async () => {
    mockSlackConfigured = true;
    await render();

    const banner = await screen.findByRole('region', {
      name: 'Use agents in Slack',
    });
    const prompt = screen.getByRole('textbox', { name: 'Prompt' });
    // Composer first, then the banner (DOCUMENT_POSITION_FOLLOWING).
    expect(
      prompt.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen
        .getByTestId('installation-scope-note')
        .compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('holds the read warning until the agents are read', async () => {
    mockUseAgents.mockReturnValue({
      ...loadedAgents,
      rows: [],
      isLoading: true,
      unreachableInstallations: ['gazelle'],
    });
    await render({ rerenderable: true });
    expect(
      await screen.findByLabelText('Reading your agents…'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    mockUseAgents.mockReturnValue({
      ...loadedAgents,
      rows: [],
      unreachableInstallations: ['gazelle'],
    });
    act(() => rerenderHome());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not read 1 environment',
    );
  });

  it('says why no session can be started when the agents could not be read', async () => {
    mockUseAgents.mockReturnValue({
      ...loadedAgents,
      rows: [],
      unreachableInstallations: ['gazelle'],
    });

    await render();

    expect(screen.getByText(/No agents could be read/)).toBeInTheDocument();
    expect(
      screen.getByText(/Could not read 1 environment/),
    ).toBeInTheDocument();
  });

  describe('when the environments in scope have no agent to start', () => {
    const prompt = () => screen.queryByRole('textbox', { name: 'Prompt' });

    it('says a pinned environment has no kagent, even while the rest still loads', async () => {
      mockUseAgents.mockReturnValue({
        ...agentsOver(
          [
            environment('golem', { home: true }),
            environment('dingo', { kagent: false }),
          ],
          'dingo',
        ),
        isLoading: true,
      });
      await render();

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
      expect(prompt()).not.toBeInTheDocument();
      // No loading indicator, not even the one still in its delay.
      expect(screen.queryByTestId('progress')).not.toBeInTheDocument();
      // The card names the environment; the scope note would say it again.
      expect(
        screen.queryByTestId('installation-scope-note'),
      ).not.toBeInTheDocument();
    });

    it('names the only environment when it has no kagent, with no other to choose', async () => {
      mockUseAgents.mockReturnValue(
        agentsOver([environment('golem', { home: true, kagent: false })]),
      );
      await render();

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
      expect(
        screen.queryByText(/No agents are deployed/),
      ).not.toBeInTheDocument();
      expect(prompt()).not.toBeInTheDocument();
    });

    it('says when no environment runs kagent under All environments', async () => {
      mockUseAgents.mockReturnValue(
        agentsOver([
          environment('golem', { home: true, kagent: false }),
          environment('dingo', { kagent: false }),
          // Switched off in the sidebar, and without kagent either.
          environment('lab', { muted: true, kagent: false }),
        ]),
      );
      await render();

      expect(
        screen.getByRole('heading', {
          name: 'kagent is not installed on any environment',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Agents run on environments with kagent. Enable the Agent Platform on one of your environments to create agents.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Go to Installations' }),
      ).toBeInTheDocument();
    });

    it('names an environment switched off in Cluster access that runs kagent, as Customize does', async () => {
      // lab runs kagent but is switched off in Cluster access: switching it
      // back on is the way to its agents, not installing kagent.
      mockUseAgents.mockReturnValue(
        agentsOver([
          environment('golem', { home: true, kagent: false }),
          environment('lab', { muted: true }),
        ]),
      );
      await render();

      expect(
        screen.getByText(
          'lab runs kagent but is switched off in Cluster access, so its agents are not read.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/is not installed/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/No agents are deployed/),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('No agents yet')).not.toBeInTheDocument();
      expect(prompt()).not.toBeInTheDocument();
    });

    it('names every environment switched off in Cluster access that runs kagent', async () => {
      mockUseAgents.mockReturnValue(
        agentsOver([
          environment('golem', { home: true, kagent: false }),
          environment('lab', { muted: true }),
          environment('dingo', { muted: true }),
        ]),
      );
      await render();

      expect(
        screen.getByText(
          'lab, dingo run kagent but are switched off in Cluster access, so their agents are not read.',
        ),
      ).toBeInTheDocument();
    });

    it('invites creating the first agent where kagent runs and no agent is deployed', async () => {
      mockUseAgents.mockReturnValue(
        agentsOver([
          environment('golem', { home: true }),
          environment('dingo', { kagent: false }),
        ]),
      );
      await render();

      expect(
        screen.getByRole('heading', { name: 'No agents yet' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Create your first agent' }),
      ).toHaveAttribute('href', '/agent-platform/agents/new');
      expect(screen.queryByText(/is not installed/)).not.toBeInTheDocument();
    });

    it('says when no environment in reach runs kagent, as Customize does', async () => {
      // golem answered without kagent; lab runs it but its access is down, so
      // there is nowhere to deploy to, and kagent is not known missing.
      mockUseAgents.mockReturnValue(
        agentsOver([
          environment('golem', { home: true, kagent: false }),
          environment('lab', { accessState: 'degraded', probe: 'pending' }),
        ]),
      );
      await render();

      expect(
        screen.getByText('No environment this portal can reach runs kagent.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/is not installed/)).not.toBeInTheDocument();
      expect(screen.queryByText('No agents yet')).not.toBeInTheDocument();
      expect(
        screen.queryByText(/No agents are deployed/),
      ).not.toBeInTheDocument();
    });

    it('leaves an environment that could not be asked to the inventory gate', async () => {
      // The home answered without kagent; dingo might run it, but its probe
      // was refused, so it is the only explanation, as on Customize.
      mockUseAgents.mockReturnValue(
        agentsOver([
          environment('golem', { home: true, kagent: false }),
          environment('dingo', {
            probe: 'failed',
            error: failedProbe('ForbiddenError'),
          }),
        ]),
      );
      await render();

      expect(screen.getByText('Inventory gate: dingo')).toBeInTheDocument();
      expect(screen.queryByText(/runs kagent/)).not.toBeInTheDocument();
      expect(screen.queryByText(/is not installed/)).not.toBeInTheDocument();
      expect(prompt()).not.toBeInTheDocument();
    });

    it('leaves a pin the portal does not know to the scope note', async () => {
      mockUseAgents.mockReturnValue(
        agentsOver([environment('golem', { home: true })], 'old-lab'),
      );
      await render();

      expect(screen.getByTestId('installation-scope-note')).toBeInTheDocument();
      expect(screen.queryByText(/kagent/)).not.toBeInTheDocument();
      expect(prompt()).not.toBeInTheDocument();
    });

    it('says when the portal knows no environment, as Customize does', async () => {
      mockUseAgents.mockReturnValue({ ...agentsOver([]), installations: [] });
      await render();

      expect(
        screen.getByText(
          'Agents are read from your environments, and this portal knows none.',
        ),
      ).toBeInTheDocument();
    });

    it('waits for an environment that is still being asked before saying anything', async () => {
      mockUseAgents.mockReturnValue({
        ...agentsOver([
          environment('golem', { home: true, kagent: false }),
          environment('dingo', { probe: 'pending' }),
        ]),
        isLoading: true,
      });
      await render();

      expect(
        await screen.findByLabelText('Reading your agents…'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/is not installed/)).not.toBeInTheDocument();
    });
  });

  it('says the Agent Platform is not enabled when its routes are not bound', async () => {
    await render({ bound: false });

    expect(
      screen.getByText('Agent Platform is not enabled'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Prompt' }),
    ).not.toBeInTheDocument();
    expect(mockUseAgents).not.toHaveBeenCalled();
  });

  describe('choosing an agent', () => {
    beforeEach(() => {
      mockUseAgents.mockReturnValue({
        ...loadedAgents,
        rows: [sre, research, docs],
      });
      mockSessions.mockReturnValue([
        sessionWith(sre, '2026-10-06T10:00:00Z'),
        sessionWith(research, '2026-10-08T10:00:00Z'),
        sessionWith(sre, '2026-10-07T10:00:00Z'),
      ]);
    });

    it('offers the recent agents, newest first, until one is chosen', async () => {
      await render();

      const chips = within(
        screen.getByRole('group', {
          name: 'Or pick one of your recent agents',
        }),
      ).getAllByRole('button');
      expect(chips).toHaveLength(2);
      expect(chips[0]).toHaveAccessibleName('Research Agent');
      expect(chips[1]).toHaveAccessibleName('SRE Agent');
      expect(
        screen.getByText('Choose an agent, then say what you need.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Required to start')).toBeInTheDocument();
    });

    it('names the chosen agent and what it can use, without its model', async () => {
      await render();

      await userEvent.click(
        screen.getByRole('button', { name: 'Research Agent' }),
      );

      expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveAttribute(
        'placeholder',
        'What can Research Agent help you with?',
      );
      expect(
        screen.getByText("You're starting a session with Research Agent."),
      ).toBeInTheDocument();
      // The model chip left this surface by design: the model is the agent
      // detail page's information, not part of starting a session.
      expect(screen.queryByText('Sonnet 4.5')).not.toBeInTheDocument();
      expect(
        screen.getByText('Can use confluence and slack.', { exact: false }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('group', {
          name: 'Or pick one of your recent agents',
        }),
      ).not.toBeInTheDocument();
    });

    it('links the chosen agent to its tools, and nothing before a choice', async () => {
      await render();

      expect(
        screen.queryByRole('link', { name: 'See which tools' }),
      ).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'Research Agent' }),
      );
      expect(
        screen.getByRole('link', { name: 'See which tools' }),
      ).toHaveAttribute(
        'href',
        '/agent-platform/agents/gazelle/research/research-agent/tools',
      );
    });

    it('links whichever agent is chosen to its own tools', async () => {
      mockUseAgents.mockReturnValue({
        ...loadedAgents,
        rows: [
          {
            ...sre,
            toolset: {
              state: 'declared',
              carrier: 'sre-agent',
              selectors: ['server:github'],
            },
          },
          research,
        ],
      });
      await render({ url: `/?agent=${encodeURIComponent(sre.id)}` });

      expect(
        screen.getByRole('link', { name: 'See which tools' }),
      ).toHaveAttribute(
        'href',
        '/agent-platform/agents/gazelle/kagent/sre-agent/tools',
      );
    });

    it('keeps the prompt and Start disabled until an agent is chosen', async () => {
      await render();

      const prompt = screen.getByRole('textbox', { name: 'Prompt' });
      expect(prompt).toBeDisabled();
      expect(prompt).toHaveAttribute(
        'placeholder',
        'Then type your message here.',
      );
      expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();

      await userEvent.click(
        screen.getByRole('button', { name: 'Research Agent' }),
      );

      expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeEnabled();
    });

    it('groups the picker by namespace behind the recent agents', async () => {
      await render();

      await userEvent.click(agentPicker());

      expect(screen.getByRole('group', { name: 'Recent' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'kagent' })).toBeInTheDocument();
      expect(
        screen.getByRole('group', { name: 'research' }),
      ).toBeInTheDocument();
    });

    it('lists the favorite agents second, after the recent ones', async () => {
      const storage = mockApis.storage();
      await storage
        .forBucket('agent-platform')
        .set('favoriteAgents', [
          { installation: 'gazelle', namespace: 'kagent', name: 'docs-agent' },
        ]);
      await render({ storage });

      await userEvent.click(agentPicker());
      const groups = screen.getAllByRole('group');

      expect(groups[0]).toHaveAccessibleName('Recent');
      expect(groups[1]).toHaveAccessibleName('Favorites');
      expect(
        within(groups[1])
          .getAllByRole('option')
          .map(option => option.textContent),
      ).toEqual([expect.stringContaining('Docs Agent')]);
    });

    it('asks for an agent in the picker until one is chosen', async () => {
      await render();

      expect(agentPicker()).toHaveTextContent('Choose an agent');
    });

    it('heads the composer with the agent picker, the message under it', async () => {
      await render();

      const prompt = screen.getByRole('textbox', { name: 'Prompt' });
      const composer = prompt.closest(
        '.agent-platform-composer',
      ) as HTMLElement;
      expect(composer).toContainElement(agentPicker());
      // Picker-first in reading and tab order (DOCUMENT_POSITION_FOLLOWING:
      // the prompt comes after the picker).
      expect(
        agentPicker().compareDocumentPosition(prompt) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(within(composer).getByText('Select agent')).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'Research Agent' }),
      );

      expect(within(composer).getByText('Select agent')).toBeInTheDocument();
    });

    it('preselects the agent a ?agent= link names', async () => {
      await render({ url: `/?agent=${encodeURIComponent(research.id)}` });

      expect(agentPicker()).toHaveTextContent('Research Agent');
      expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeEnabled();
      expect(
        screen.getByText("You're starting a session with Research Agent."),
      ).toBeInTheDocument();
    });

    it('ignores a ?agent= link to an agent that cannot be started', async () => {
      mockUseAgents.mockReturnValue({
        ...loadedAgents,
        rows: [sre, { ...research, readiness: 'failed' }, docs],
      });
      await render({ url: `/?agent=${encodeURIComponent(research.id)}` });

      expect(agentPicker()).toHaveTextContent('Choose an agent');
      expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeDisabled();
    });

    it('ends the picker with Manage agents, which opens the agents under Customize', async () => {
      await render({ manageAgentsHref: '/customize/agents' });

      await userEvent.click(agentPicker());
      const options = screen.getAllByRole('option');
      expect(options[options.length - 1]).toHaveAccessibleName('Manage agents');

      await userEvent.click(options[options.length - 1]);

      expect(mockNavigate).toHaveBeenCalledWith('/customize/agents');
      expect(agentPicker()).toHaveTextContent('Choose an agent');
    });

    it('offers no search over a short list of agents', async () => {
      await render({ manageAgentsHref: '/customize/agents' });

      await userEvent.click(agentPicker());
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    });

    it('keeps Manage agents in the picker while searching', async () => {
      // Past SEARCH_MIN, where the picker offers its search.
      const more = Array.from({ length: 7 }, (_, index) => ({
        ...sre,
        id: `gazelle/kagent/helper-${index}`,
        name: `Helper ${index}`,
        technicalName: `helper-${index}`,
      }));
      mockUseAgents.mockReturnValue({
        ...loadedAgents,
        rows: [sre, research, docs, ...more],
      });
      await render({ manageAgentsHref: '/customize/agents' });

      await userEvent.click(agentPicker());
      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search 10 agents' }),
        'docs',
      );

      expect(
        screen.getAllByRole('option').map(option => option.textContent),
      ).toEqual([expect.stringContaining('Docs Agent'), 'Manage agents']);
    });

    it('leaves Manage agents out without a destination', async () => {
      await render();

      await userEvent.click(agentPicker());

      expect(
        screen.queryByRole('option', { name: 'Manage agents' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Manage agents' }),
      ).not.toBeInTheDocument();
    });
  });
});

describe('AgentPlatformHome on a phone (T22)', () => {
  let layout: MockedLayout;
  afterEach(() => layout.restore());

  /** bui's Container around the page. */
  const container = () =>
    screen
      .getByRole('heading', { level: 1 })
      .closest<HTMLElement>('.bui-Container')!;

  it('drops the Container’s own bottom margin, so the centred page fits the view (P6)', async () => {
    layout = mockPhoneLayout();
    await render();

    // bui's `mb` utility: the class reads its value from `--mb`.
    expect(container()).toHaveClass('bui-mb');
    expect(container().style.getPropertyValue('--mb')).toBe('0');
  });

  it('tells a touch user to tap the arrow, not to press Enter (B2)', async () => {
    layout = mockPhoneLayout();
    // Preselected, as a "New session" link from elsewhere does it.
    await render({ url: `/?agent=${encodeURIComponent(sre.id)}` });

    expect(
      screen.getByText('Tap the arrow to start the session with this message.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveAttribute(
      'enterkeyhint',
      'enter',
    );
  });

  it('keeps the keyboard caption on a desktop', async () => {
    layout = mockDesktopLayout();
    // Preselected, as a "New session" link from elsewhere does it.
    await render({ url: `/?agent=${encodeURIComponent(sre.id)}` });

    // The keys are key caps; the words read as the caption does.
    expect(
      screen.getByText(/starts the session with this message/).textContent,
    ).toBe(
      'Enter starts the session with this message, Shift+Enter for a new line.',
    );
  });
});
