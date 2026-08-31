import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import { sessionsRouteRef } from '../../routes';
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
  SessionsTable: () => <div data-testid="sessions-table" />,
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

const loadedSessions: SessionsContextValue = {
  rows: [],
  isLoading: false,
  isLoadingMore: false,
  hasInstallations: true,
  unreachableInstallations: [],
  notUserScopedInstallations: [],
};

const loadedAgents: AgentsContextValue = {
  rows: [sre],
  isLoading: false,
  isLoadingMore: false,
  hasInstallations: true,
  unreachableInstallations: [],
};

async function render() {
  return renderInTestApp(<SessionsIndexPage />, {
    mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
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
  mockUseSessions.mockReturnValue(loadedSessions);
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
    it('says so rather than offering a box that refuses every Start', async () => {
      mockUseAgents.mockReturnValue({ ...loadedAgents, rows: [] });
      await render();

      expect(
        screen.getByText(
          'No agents are deployed on the reachable installations, so there is none to start a session with.',
        ),
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

  it('still explains an unconfigured instance', async () => {
    mockUseSessions.mockReturnValue({
      ...loadedSessions,
      hasInstallations: false,
    });
    await render();

    expect(screen.getByText('No installations configured')).toBeInTheDocument();
  });
});
