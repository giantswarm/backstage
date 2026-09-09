import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';

import { agentsRouteRef, sessionsRouteRef } from '../../routes';
import type { AgentRow, AgentsContextValue } from '../AgentsDataProvider';
import type { SessionsContextValue } from '../SessionsDataProvider';
import { SessionsIndexPage } from './SessionsIndexPage';

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => 'https://avatars.example/agent.png',
}));

const mockUseAgents = jest.fn<AgentsContextValue, []>();
jest.mock('../AgentsDataProvider', () => ({
  ...jest.requireActual('../AgentsDataProvider'),
  useAgents: () => mockUseAgents(),
}));

const mockUseSessions = jest.fn<SessionsContextValue, []>();
jest.mock('../SessionsDataProvider', () => ({
  ...jest.requireActual('../SessionsDataProvider'),
  SessionsDataProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useSessions: () => mockUseSessions(),
}));

// The table is not what these tests are about, and it mounts a bui Table with its
// own machinery.
jest.mock('../SessionsTable', () => ({
  SessionsTable: ({ rows }: { rows: unknown[] }) => (
    <div data-testid="sessions-table">{rows.length}</div>
  ),
}));

// Whether the list renders as one group per installation is the section
// scope's decision (gs); here it is whatever the test says. The group
// components themselves are real.
let mockGrouped = false;
jest.mock('../InstallationGroups', () => ({
  ...jest.requireActual('../InstallationGroups'),
  useGroupedByInstallation: () => mockGrouped,
  InstallationScopeNote: () => null,
}));

const mockCreateSession = jest.fn();
const mockUseCreateSession = jest.fn();
jest.mock('../../hooks/useCreateSession', () => ({
  useCreateSession: () => mockUseCreateSession(),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

function agentRow(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'gazelle/kagent/sre-agent',
    installation: 'gazelle',
    namespace: 'kagent',
    name: 'SRE Agent',
    technicalName: 'sre-agent',
    description: 'Investigates incidents',
    skillCount: 3,
    readiness: 'ready',
    ...overrides,
  };
}

const sre = agentRow();
// A second ready agent, so the picker offers a real choice: with one agent it is
// preselected and disabled, which would make "the chosen agent" meaningless here.
const issues = agentRow({
  id: 'gazelle/kagent/issue-tracker',
  name: 'Issue Tracker',
  technicalName: 'issue-tracker',
});

// One session, for the tests that are about the page with a list on it. An empty
// `rows` is the first-run state now, which renders a different screen.
const session = {
  id: 'gazelle/s1',
  sessionId: 's1',
  installation: 'gazelle',
  title: 'Triage the incident',
  agentName: 'SRE Agent',
};

const loadedSessions: SessionsContextValue = {
  rows: [],
  groups: [],
  scope: 'all',
  // The scoped kagent installations. At least one of them has to have actually
  // been queried before the page claims the user has never had a session.
  installations: ['gazelle'],
  isLoading: false,
  isLoadingMore: false,
  hasInstallations: true,
  unreachableInstallations: [],
  notUserScopedInstallations: [],
  notReachableInstallations: [],
};

const loadedAgents: AgentsContextValue = {
  rows: [sre, issues],
  scope: 'all',
  installations: ['gazelle'],

  isLoading: false,
  isLoadingMore: false,
  hasInstallations: true,
  unreachableInstallations: [],
};

// Re-renders the page from *inside* the test app: RTL's `rerender` replaces the
// root children, which would drop the Router that `useRouteRef` needs.
function Rerenderable() {
  const [, bump] = useState(0);
  return (
    <>
      <button type="button" onClick={() => bump(n => n + 1)}>
        rerender
      </button>
      <SessionsIndexPage />
    </>
  );
}

async function renderRerenderable() {
  return renderInTestApp(<Rerenderable />, {
    mountedRoutes: {
      '/agent-platform/sessions': sessionsRouteRef,
      '/agent-platform/agents': agentsRouteRef,
    },
  });
}

async function render() {
  return renderInTestApp(<SessionsIndexPage />, {
    mountedRoutes: {
      '/agent-platform/sessions': sessionsRouteRef,
      // The Agents tab: the first-run state links into its create flow.
      '/agent-platform/agents': agentsRouteRef,
    },
  });
}

const prompt = () => screen.getByRole('textbox', { name: 'Prompt' });

beforeEach(() => {
  window.localStorage.clear();
  mockNavigate.mockReset();
  mockCreateSession.mockReset();
  mockCreateSession.mockResolvedValue('new-session-id');
  mockUseCreateSession.mockReturnValue({
    createSession: mockCreateSession,
    isCreating: false,
    error: null,
    reset: jest.fn(),
  });
  mockUseSessions.mockReturnValue({ ...loadedSessions, rows: [session] });
  mockUseAgents.mockReturnValue(loadedAgents);
});

describe('SessionsIndexPage', () => {
  it('offers the composer inline, above the list', async () => {
    // Inline rather than behind a button: this list is the spec's "Mine" scope,
    // where creating is the job of the view rather than a secondary action.
    await render();

    expect(screen.getByText('Start a new session')).toBeInTheDocument();
    expect(prompt()).toBeInTheDocument();
  });

  it('starts collapsed, expanding on focus', async () => {
    await render();

    expect(
      screen.queryByRole('button', { name: 'Start' }),
    ).not.toBeInTheDocument();

    await userEvent.click(prompt());

    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  describe('when there is no agent to start a session with', () => {
    it('invites creating one rather than offering a box that refuses every Start', async () => {
      // Nothing deployed and the fleet answered: the step before any session is
      // creating an agent, so this is the Agents tab's invitation rather than a
      // sentence about sessions.
      mockUseAgents.mockReturnValue({ ...loadedAgents, rows: [] });
      await render();

      expect(
        screen.getByRole('heading', { name: 'No agents yet' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Create your first agent/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('textbox', { name: 'Prompt' }),
      ).not.toBeInTheDocument();
    });

    it('distinguishes unreadable agents from no agents', async () => {
      // "None deployed" is a claim we cannot make when the read failed.
      mockUseAgents.mockReturnValue({
        ...loadedAgents,
        rows: [],
        unreachableInstallations: ['golem'],
      });
      await render();

      expect(
        screen.getByText(
          'No agents could be read, so there is none to start a session with. See the warning below.',
        ),
      ).toBeInTheDocument();
    });

    it('distinguishes deployed-but-not-ready from nothing deployed', async () => {
      // Different places to look: "none deployed" means deploy one, "none ready"
      // means go and read why on the Agents tab. Conflating them sends the user to
      // the wrong screen.
      mockUseAgents.mockReturnValue({
        ...loadedAgents,
        rows: [
          agentRow({
            readiness: 'notReady',
            readinessMessage: '0/1 pods ready',
          }),
          agentRow({ id: 'gazelle/kagent/other', readiness: 'notAccepted' }),
        ],
      });
      await render();

      expect(
        screen.getByText(
          'None of the 2 agents on the fleet are ready, so there is none to start a session with. The Agents tab says why.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('textbox', { name: 'Prompt' }),
      ).not.toBeInTheDocument();
    });

    it('reads naturally when the fleet holds exactly one unready agent', async () => {
      mockUseAgents.mockReturnValue({
        ...loadedAgents,
        rows: [agentRow({ readiness: 'notReady' })],
      });
      await render();

      expect(
        screen.getByText(
          'The only agent on the fleet is not ready, so there is none to start a session with. The Agents tab says why.',
        ),
      ).toBeInTheDocument();
    });

    it('offers the composer when at least one agent is ready', async () => {
      // The other half of the same rule: one usable agent behind any number of
      // unusable ones must not withhold the composer.
      mockUseAgents.mockReturnValue({
        ...loadedAgents,
        rows: [agentRow({ readiness: 'notReady' }), issues],
      });
      await render();

      expect(
        screen.getByRole('textbox', { name: 'Prompt' }),
      ).toBeInTheDocument();
    });

    it('shows nothing at all while the fleet is still being read', async () => {
      // Neither a composer nor a "no agents" claim: both would be wrong.
      mockUseAgents.mockReturnValue({
        ...loadedAgents,
        rows: [],
        isLoading: true,
      });
      await render();

      expect(
        screen.queryByRole('textbox', { name: 'Prompt' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/none to start a session with/)).toBeNull();
    });
  });

  describe('with no session on the fleet yet', () => {
    beforeEach(() => {
      mockUseSessions.mockReturnValue(loadedSessions);
    });

    it('makes the composer the invitation and shows no empty table', async () => {
      await render();

      expect(
        screen.getByRole('heading', { name: 'Start your first session' }),
      ).toBeInTheDocument();
      // Expanded from the start: there is no list below for it to make room for,
      // so the Start button is there without having to click into the box first.
      expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
      expect(screen.queryByTestId('sessions-table')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('searchbox', { name: 'Search sessions' }),
      ).not.toBeInTheDocument();
      // The blurb describes a list that isn't there.
      expect(
        screen.queryByText(/agent chat sessions/i),
      ).not.toBeInTheDocument();
    });

    it('shows no group headings under "All installations" either', async () => {
      mockGrouped = true;
      mockUseSessions.mockReturnValue({
        ...loadedSessions,
        installations: ['gazelle', 'golem'],
        groups: [
          { installation: 'gazelle', home: true, rows: [], status: 'empty' },
          { installation: 'golem', home: false, rows: [], status: 'empty' },
        ],
      });

      await render();

      expect(
        screen.queryByRole('heading', { level: 3 }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('no sessions here')).not.toBeInTheDocument();
      mockGrouped = false;
    });

    it('invites creating an agent when the fleet holds none', async () => {
      mockUseAgents.mockReturnValue({ ...loadedAgents, rows: [] });

      await render();

      expect(
        screen.getByRole('heading', { name: 'No agents yet' }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('sessions-table')).not.toBeInTheDocument();
    });

    it('does not claim a first run when the sessions could not be read', async () => {
      // An empty list because every read failed is not an empty history. The
      // warning is the answer; the composer stays in its inline strip.
      mockUseSessions.mockReturnValue({
        ...loadedSessions,
        unreachableInstallations: ['gazelle'],
      });

      await render();

      expect(
        screen.queryByRole('heading', { name: 'Start your first session' }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Start a new session')).toBeInTheDocument();
      expect(
        screen.getByText(/Couldn't read 1 installation/),
      ).toBeInTheDocument();
    });

    it('does not claim a first run when no installation was ever queried', async () => {
      // Every kagent endpoint in scope is unreachable from this portal, so
      // nothing was asked on the user's behalf -- an empty list says nothing.
      mockUseSessions.mockReturnValue({
        ...loadedSessions,
        installations: ['gazelle', 'golem'],
        notReachableInstallations: ['gazelle', 'golem'],
      });

      await render();

      expect(
        screen.queryByRole('heading', { name: 'Start your first session' }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Start a new session')).toBeInTheDocument();
    });

    it('still claims a first run when one installation answered and others are unreachable', async () => {
      // The one that answered is enough to know the user has no sessions; the
      // quiet note below names the rest.
      mockUseSessions.mockReturnValue({
        ...loadedSessions,
        installations: ['gazelle', 'golem'],
        notReachableInstallations: ['golem'],
      });

      await render();

      expect(
        screen.getByRole('heading', { name: 'Start your first session' }),
      ).toBeInTheDocument();
    });

    it('shows activity rather than a blank tab while the agents are still resolving', async () => {
      // The sessions settled empty but the agent fan-out has not: the composer
      // is withheld, and the blurb and table are gated off, so without a
      // progress indicator the content area would render nothing at all.
      mockUseAgents.mockReturnValue({ ...loadedAgents, isLoading: true });

      await render();

      expect(screen.getByTestId('progress')).toBeInTheDocument();
    });
  });

  describe('the composer container', () => {
    beforeEach(() => {
      mockUseSessions.mockReturnValue(loadedSessions);
    });

    it('is withheld until the list settles, so it never has to move', async () => {
      // `isLoading` stays true until every installation answers, so on an empty
      // fleet the composer would otherwise render inline for the whole fan-out
      // and then jump into the first-run card -- a different root element type,
      // which remounts it and discards whatever was typed.
      mockUseSessions.mockReturnValue({ ...loadedSessions, isLoading: true });

      await render();

      expect(
        screen.queryByRole('textbox', { name: 'Prompt' }),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('progress')).toBeInTheDocument();
    });

    it('does not move when a session arrives later, keeping a typed prompt', async () => {
      await renderRerenderable();

      expect(
        screen.getByRole('heading', { name: 'Start your first session' }),
      ).toBeInTheDocument();
      await userEvent.type(prompt(), 'why is the ingress failing?');

      // A background refetch, or a session started in another tab. The latch
      // keeps the container put; without it the root element type would change
      // and take the half-typed prompt with it.
      mockUseSessions.mockReturnValue({ ...loadedSessions, rows: [session] });
      await userEvent.click(screen.getByRole('button', { name: 'rerender' }));

      expect(screen.getByTestId('sessions-table')).toBeInTheDocument();
      expect(prompt()).toHaveValue('why is the ingress failing?');
    });
  });

  describe('starting one', () => {
    async function start(text = 'why is the ingress failing?') {
      const rendered = await render();
      await userEvent.click(prompt());
      await userEvent.click(screen.getByRole('button', { name: /Agent/ }));
      await userEvent.click(screen.getByRole('option', { name: /SRE Agent/ }));
      await userEvent.type(prompt(), text);
      await userEvent.click(screen.getByRole('button', { name: 'Start' }));
      return rendered;
    }

    it('creates the session with the chosen agent and the prompt', async () => {
      await start();

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalledWith({
          agent: sre,
          prompt: 'why is the ingress failing?',
        });
      });
    });

    it('navigates to the new session, carrying the prompt for the detail page to send', async () => {
      await start();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/agent-platform/sessions/gazelle/new-session-id',
          {
            state: {
              newSession: {
                text: 'why is the ingress failing?',
                agentNamespace: 'kagent',
                // The technical name, which is what addresses the A2A endpoint.
                agentName: 'sre-agent',
              },
            },
          },
        );
      });
    });

    it('remembers the agent, so the next session defaults to it', async () => {
      // Unmounted before the second render: `renderInTestApp` would otherwise
      // leave the first page mounted, and the picker found below would be its
      // own — still showing the agent from component state rather than from
      // storage, which is the thing under test.
      const { unmount } = await start();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalled();
      });
      unmount();

      await render();
      // The inline composer starts collapsed, so the picker only exists once the
      // prompt has focus.
      await userEvent.click(prompt());

      expect(screen.getByRole('button', { name: /Agent/ })).toHaveTextContent(
        'SRE Agent',
      );
    });

    it('stays put when the create fails, keeping the prompt', async () => {
      mockCreateSession.mockRejectedValue(new Error('kagent said no'));
      mockUseCreateSession.mockReturnValue({
        createSession: mockCreateSession,
        isCreating: false,
        error: new Error('kagent said no'),
        reset: jest.fn(),
      });
      await start();

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled();
      });
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(screen.getByText('Session not started')).toBeInTheDocument();
      expect(prompt()).toHaveValue('why is the ingress failing?');
    });

    it('does not remember an agent whose session was never created', async () => {
      mockCreateSession.mockRejectedValue(new Error('kagent said no'));
      const { unmount } = await start();

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled();
      });
      unmount();

      await render();
      // The inline composer starts collapsed, so the picker only exists once the
      // prompt has focus.
      await userEvent.click(prompt());

      expect(screen.getByRole('button', { name: /Agent/ })).toHaveTextContent(
        'Select an agent',
      );
    });
  });

  it('names installations the portal cannot reach in a quiet note, not a warning', async () => {
    mockUseSessions.mockReturnValue({
      ...loadedSessions,
      notReachableInstallations: ['golem', 'wombat'],
    });

    await render();

    expect(
      screen.getByText('golem, wombat: not reachable from this portal'),
    ).toBeInTheDocument();
    // Never queried, so not a read failure: the warning card stays away.
    expect(screen.queryByText(/Couldn't read/)).toBeNull();
  });

  it('still explains an unconfigured instance', async () => {
    mockUseSessions.mockReturnValue({
      ...loadedSessions,
      hasInstallations: false,
    });
    await render();

    expect(screen.getByText('No installations configured')).toBeInTheDocument();
  });
});

describe('SessionsIndexPage under "All installations" on a multi-installation portal', () => {
  const gazelleSession = {
    id: 'gazelle/s1',
    sessionId: 's1',
    installation: 'gazelle',
    title: 'Triage the incident',
    agentName: 'SRE Agent',
  };
  const golemSession = {
    id: 'golem/s2',
    sessionId: 's2',
    installation: 'golem',
    title: 'Review the release',
    agentName: 'Reviewer',
  };

  beforeEach(() => {
    mockGrouped = true;
    mockUseSessions.mockReturnValue({
      ...loadedSessions,
      rows: [gazelleSession, golemSession],
      installations: ['gazelle', 'golem', 'wombat'],
      groups: [
        {
          installation: 'gazelle',
          home: true,
          pipeline: 'testing',
          rows: [gazelleSession],
          status: 'ready',
        },
        {
          installation: 'golem',
          home: false,
          rows: [golemSession],
          status: 'ready',
        },
        {
          installation: 'wombat',
          home: false,
          rows: [],
          status: 'not-reachable',
        },
      ],
    });
  });

  afterEach(() => {
    mockGrouped = false;
  });

  it('renders one group per installation, home first, with a status line each', async () => {
    await render();

    expect(
      screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent),
    ).toEqual(['gazelle', 'golem', 'wombat']);
    expect(screen.getAllByText('1 session')).toHaveLength(2);
    expect(
      screen.getByText('not reachable from this portal'),
    ).toBeInTheDocument();
    // One table per group with rows; none for the unreachable one.
    expect(screen.getAllByTestId('sessions-table')).toHaveLength(2);
  });

  it('searches across every group from one field', async () => {
    await render();

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search sessions' }),
      'release',
    );

    // gazelle's group keeps its header but its table has no matching row left;
    // golem's still has one.
    const tables = screen.getAllByTestId('sessions-table');
    expect(tables.map(table => table.textContent)).toEqual(['0', '1']);
  });
});
