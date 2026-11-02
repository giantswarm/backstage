import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NEW_SESSION_STATE_KEY } from '../../hooks/useNewSessionHandoff';
import {
  agentsRouteRef,
  installationsExternalRouteRef,
  sessionsRouteRef,
} from '../../routes';
import type { AgentRow, AgentsContextValue } from '../AgentsDataProvider';
import { StartNewSession, type StartNewSessionProps } from './StartNewSession';

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => 'https://avatars.example/agent.png',
}));

// The picker's reads are the hook's own tests'; here the installation offers none.
jest.mock('../../hooks/useSessionWorkspaces', () => ({
  ...jest.requireActual('../../hooks/useSessionWorkspaces'),
  useSessionWorkspaces: () => ({ workspaces: [], isLoading: false }),
}));

// The toolchain picker's reads are its own tests'; here it is not offered.
jest.mock('../ToolchainPicker', () => ({ ToolchainPicker: () => null }));

const mockUseAgents = jest.fn<AgentsContextValue, []>();
jest.mock('../AgentsDataProvider', () => ({
  ...jest.requireActual('../AgentsDataProvider'),
  useAgents: () => mockUseAgents(),
}));

const mockCreateSession = jest.fn();
const mockUseCreateSession = jest.fn();
jest.mock('../../hooks/useCreateSession', () => ({
  useCreateSession: (entryPoint: string) => mockUseCreateSession(entryPoint),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
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

const loadedAgents: AgentsContextValue = {
  rows: [sre],
  scope: 'all',
  installations: ['gazelle'],
  isLoading: false,
  isLoadingMore: false,
  hasInstallations: true,
  unreachableInstallations: [],
  noAccessInstallations: [],
  kagentMissing: undefined,
  kagentSwitchedOff: [],
  unknownPin: undefined,
  inventoryFailure: undefined,
  retry: async () => {},
};

function render(props: StartNewSessionProps, { agentsBound = true } = {}) {
  return renderInTestApp(<StartNewSession {...props} />, {
    mountedRoutes: {
      '/sessions': sessionsRouteRef,
      ...(agentsBound && { '/customize/agents': agentsRouteRef }),
      '/installations': installationsExternalRouteRef,
    },
  });
}

const prompt = () => screen.getByRole('textbox', { name: 'Prompt' });

beforeEach(() => {
  window.localStorage.clear();
  mockNavigate.mockReset();
  mockCreateSession.mockReset();
  mockCreateSession.mockResolvedValue('new-session-id');
  mockUseCreateSession.mockReset();
  mockUseCreateSession.mockReturnValue({
    createSession: mockCreateSession,
    isCreating: false,
    error: null,
    reset: jest.fn(),
  });
  mockUseAgents.mockReturnValue(loadedAgents);
});

describe('StartNewSession', () => {
  it('reports sessions under the entry point it is given', async () => {
    await render({ entryPoint: 'home' });

    expect(mockUseCreateSession).toHaveBeenCalledWith('home');
  });

  it('starts a session and lands on it with the prompt in hand', async () => {
    await render({ entryPoint: 'home', layout: 'standalone' });

    await userEvent.type(prompt(), 'Why is the ingress failing?');
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(mockCreateSession).toHaveBeenCalledWith({
      agent: sre,
      prompt: 'Why is the ingress failing?',
    });
    expect(mockNavigate).toHaveBeenCalledWith(
      '/sessions/gazelle/new-session-id',
      {
        state: {
          [NEW_SESSION_STATE_KEY]: {
            text: 'Why is the ingress failing?',
            agentNamespace: 'kagent',
            agentName: 'sre-agent',
          },
        },
      },
    );
  });

  it('inline, sits collapsed under its own heading', async () => {
    await render({ entryPoint: 'sessionsList' });

    expect(screen.getByText('Start a new session')).toBeInTheDocument();
    expect(prompt()).toHaveAttribute('rows', '1');
  });

  it('standalone, renders the expanded composer with no heading or card', async () => {
    await render({ entryPoint: 'home', layout: 'standalone' });

    expect(prompt()).toHaveAttribute('rows', '3');
    expect(screen.queryByText('Start a new session')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Start your first session' }),
    ).not.toBeInTheDocument();
  });

  it('on first run, renders the composer in the invitation card', async () => {
    await render({ entryPoint: 'sessionsList', layout: 'firstRun' });

    expect(
      screen.getByRole('heading', { name: 'Start your first session' }),
    ).toBeInTheDocument();
  });

  it('inline, renders nothing while the agents are loading', async () => {
    mockUseAgents.mockReturnValue({ ...loadedAgents, isLoading: true });

    await render({ entryPoint: 'sessionsList' });

    expect(screen.queryByTestId('progress')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Prompt' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Start a new session')).not.toBeInTheDocument();
  });

  it('standalone, shows the loading indicator while the agents are loading', async () => {
    mockUseAgents.mockReturnValue({ ...loadedAgents, isLoading: true });

    await render({ entryPoint: 'home', layout: 'standalone' });

    expect(
      await screen.findByLabelText('Reading your agents…'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Prompt' }),
    ).not.toBeInTheDocument();
  });

  it('says kagent is missing in place of the composer, even while the agents load', async () => {
    mockUseAgents.mockReturnValue({
      ...loadedAgents,
      rows: [],
      scope: 'dingo',
      installations: [],
      isLoading: true,
      kagentMissing: { installations: ['dingo'], canChooseAnother: true },
    });

    await render({ entryPoint: 'home', layout: 'standalone' });

    expect(
      screen.getByRole('heading', { name: 'kagent is not installed on dingo' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to Installations' }),
    ).toHaveAttribute('href', '/installations');
    expect(
      screen.queryByRole('textbox', { name: 'Prompt' }),
    ).not.toBeInTheDocument();
  });

  it('inline, says no environment in reach runs kagent instead of a full card', async () => {
    mockUseAgents.mockReturnValue({
      ...loadedAgents,
      rows: [],
      scope: 'dingo',
      installations: [],
      kagentMissing: { installations: ['dingo'], canChooseAnother: true },
    });

    await render({ entryPoint: 'sessionsList' });

    expect(
      screen.getByText('No environment this portal can reach runs kagent.'),
    ).toHaveAttribute('data-variant', 'body-small');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  describe("when the agents' installation cannot start sessions as the person", () => {
    const blocker =
      "Muster on gazelle has no per-user sign-in in this portal, so agent-manager would act under muster's shared identity instead of as you.";

    beforeEach(() => {
      mockUseAgents.mockReturnValue({
        ...loadedAgents,
        rows: [{ ...sre, sessionBlocker: blocker }],
      });
    });

    it('says nothing while it is still being asked', async () => {
      mockUseAgents.mockReturnValue({
        ...loadedAgents,
        rows: [{ ...sre, isSessionPending: true }],
      });
      await render({ entryPoint: 'sessionsList' });

      expect(
        screen.queryByRole('textbox', { name: 'Prompt' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Sessions cannot start/),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/not ready/)).not.toBeInTheDocument();
    });

    it('offers no composer and says why, instead of a Start that ends in a refusal', async () => {
      await render({ entryPoint: 'sessionsList' });

      expect(
        screen.queryByRole('textbox', { name: 'Prompt' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(`Sessions cannot start from this portal. ${blocker}`),
      ).toBeInTheDocument();
    });
  });

  describe('when no agent is ready', () => {
    beforeEach(() => {
      mockUseAgents.mockReturnValue({
        ...loadedAgents,
        rows: [{ ...sre, readiness: 'notReady' }],
      });
    });

    it('inline, points at the neighbouring Agents tab', async () => {
      await render({ entryPoint: 'sessionsList' });

      expect(
        screen.getByText(
          'The only agent is not ready for a session. The Agents tab says why.',
        ),
      ).toHaveAttribute('data-variant', 'body-small');
    });

    it('standalone, links to the Agents tab', async () => {
      await render({ entryPoint: 'home', layout: 'standalone' });

      expect(
        screen.getByRole('link', { name: 'See why on the Agents tab.' }),
      ).toHaveAttribute('href', '/customize/agents');
    });

    it('standalone, says only what is wrong when the Agents tab is not bound', async () => {
      await render(
        { entryPoint: 'home', layout: 'standalone' },
        { agentsBound: false },
      );

      expect(
        screen.getByText('The only agent is not ready for a session.'),
      ).toHaveAttribute('data-variant', 'body-medium');
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.queryByText(/Agents tab/)).not.toBeInTheDocument();
    });
  });
});
