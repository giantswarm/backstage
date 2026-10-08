import type { ReactNode } from 'react';
import { identityApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';

import { agentsRouteRef, sessionsRouteRef } from '../../routes';
import type { AgentRow, AgentsContextValue } from '../AgentsDataProvider';
import { AgentPlatformHome } from './AgentPlatformHome';

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
}: { bound?: boolean; displayName?: string } = {}) {
  return renderInTestApp(<AgentPlatformHome />, {
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
  });
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 9, 8, 15, 0), advanceTimers: true });
  window.localStorage.clear();
  mockUseAgents.mockClear();
  mockUseCreateSession.mockReset();
  mockUseCreateSession.mockReturnValue({
    createSession: jest.fn(),
    isCreating: false,
    error: null,
    reset: jest.fn(),
  });
  mockUseAgents.mockReturnValue(loadedAgents);
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
});
