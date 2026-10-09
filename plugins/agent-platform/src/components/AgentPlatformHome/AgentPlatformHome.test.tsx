import type { ReactNode } from 'react';
import { identityApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { agentsRouteRef, sessionsRouteRef } from '../../routes';
import type { AgentRow, AgentsContextValue } from '../AgentsDataProvider';
import type { SessionRow } from '../SessionsDataProvider/helpers';
import { AgentPlatformHome } from './AgentPlatformHome';

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
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  InstallationInventoryGate: () => <div data-testid="inventory-gate" />,
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
};

function render({
  bound = true,
  displayName = 'Jane Doe',
  manageAgentsHref,
}: {
  bound?: boolean;
  displayName?: string;
  manageAgentsHref?: string;
} = {}) {
  return renderInTestApp(
    <AgentPlatformHome manageAgentsHref={manageAgentsHref} />,
    {
      apis: [
        [
          identityApiRef,
          mockApis.identity.mock({
            getProfileInfo: async () => ({ displayName }),
          }),
        ],
      ],
      ...(bound && {
        mountedRoutes: {
          '/agent-platform/sessions': sessionsRouteRef,
          '/agent-platform/agents': agentsRouteRef,
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

  it('says which installation scope the composer reads', async () => {
    await render();

    expect(screen.getByTestId('installation-scope-note')).toBeInTheDocument();
    expect(screen.getByTestId('inventory-gate')).toBeInTheDocument();
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
      screen.getByText(/Couldn't read 1 installation/),
    ).toBeInTheDocument();
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
        screen.getByText(
          'Choose an agent to work with, then tell it what you need.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('Required to start')).toBeInTheDocument();
    });

    it('names the chosen agent, its model and what it can use', async () => {
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
      expect(screen.getByText('Sonnet 4.5')).toBeInTheDocument();
      expect(
        screen.getByText('Can use confluence and slack'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('group', {
          name: 'Or pick one of your recent agents',
        }),
      ).not.toBeInTheDocument();
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

    it('asks for an agent in the picker until one is chosen', async () => {
      await render();

      expect(agentPicker()).toHaveTextContent('Choose an agent');
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

    it('keeps Manage agents in the picker while searching', async () => {
      await render({ manageAgentsHref: '/customize/agents' });

      await userEvent.click(agentPicker());
      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search 3 agents' }),
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
