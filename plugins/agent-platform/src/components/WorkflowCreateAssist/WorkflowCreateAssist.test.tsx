import type { ReactNode } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';

import { workflowCreatePrompt } from '../../lib/workflowAgentPrompts';
import { sessionsRouteRef } from '../../routes';
import type { AgentRow } from '../AgentsDataProvider';
import { WorkflowCreateAssist } from './WorkflowCreateAssist';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

let configuredRoles: Record<string, string | undefined> = {};
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: () => ({
    config: {
      getOptionalString: (key: string) =>
        configuredRoles[key.replace('agentPlatform.metaAgents.', '')],
    },
    isLoading: false,
  }),
}));

function mockPassThrough({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
let mockRows: AgentRow[] = [];
const mockAgentsRead = jest.fn();
jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: ({ children }: { children: ReactNode }) => {
    mockAgentsRead();
    return <>{children}</>;
  },
  useAgents: () => ({ rows: mockRows, isLoading: false }),
}));
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: mockPassThrough,
}));
jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: mockPassThrough,
}));
jest.mock('../AgentPlatformCookieAuth', () => ({
  AgentPlatformCookieAuth: mockPassThrough,
}));
jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => undefined,
}));

const createSession = jest.fn();
const mockUseCreateSession = jest.fn();
let mockCreationError: Error | null = null;
jest.mock('../../hooks/useCreateSession', () => ({
  useCreateSession: (entryPoint: string) => {
    mockUseCreateSession(entryPoint);
    return {
      createSession,
      isCreating: false,
      error: mockCreationError,
      reset: jest.fn(),
    };
  },
}));

function agent(
  technicalName: string,
  name = technicalName,
  readiness: AgentRow['readiness'] = 'ready',
): AgentRow {
  return {
    id: `gazelle/kagent/${technicalName}`,
    installation: 'gazelle',
    namespace: 'kagent',
    name,
    technicalName,
    description: '',
    skillCount: 0,
    readiness,
  } as AgentRow;
}

function renderAssist() {
  return renderInTestApp(<WorkflowCreateAssist installation="gazelle" />, {
    mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
  });
}

beforeEach(() => {
  configuredRoles = {};
  mockRows = [agent('swarm-operator'), agent('workflow-manager', 'Flo')];
  mockCreationError = null;
  createSession.mockReset();
  mockNavigate.mockReset();
  mockUseCreateSession.mockReset();
  mockAgentsRead.mockReset();
});

describe('WorkflowCreateAssist', () => {
  it('renders nothing, and reads no agents, while the workflowManagement role is unconfigured', async () => {
    await renderAssist();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(mockAgentsRead).not.toHaveBeenCalled();
  });

  it('renders nothing when the configured agent does not exist', async () => {
    configuredRoles = { workflowManagement: 'gone-agent' };
    await renderAssist();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing when the configured agent cannot take a session', async () => {
    configuredRoles = { workflowManagement: 'workflow-manager' };
    mockRows = [agent('workflow-manager', 'Flo', 'notReady')];
    await renderAssist();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers, in one line of the meta-agent strip, to create workflows with the agent', async () => {
    configuredRoles = { workflowManagement: 'workflow-manager' };
    await renderAssist();

    const strip = screen.getByRole('region', {
      name: 'Create workflows with Flo',
    });
    expect(strip).toHaveTextContent('Need a workflow? Flo builds it with you.');
    // One line: the title, no second sentence.
    expect(strip.querySelectorAll('p')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Create with Flo' }),
    ).toBeInTheDocument();
  });

  it('starts a session with the workflow agent and opens it', async () => {
    configuredRoles = { workflowManagement: 'workflow-manager' };
    createSession.mockResolvedValue('session-3');
    await renderAssist();

    await userEvent.click(
      screen.getByRole('button', { name: 'Create with Flo' }),
    );

    // Reported as the existing session-start event, from this entry point.
    expect(mockUseCreateSession).toHaveBeenCalledWith('workflowCreateAssist');
    const prompt = workflowCreatePrompt('gazelle');
    expect(createSession).toHaveBeenCalledWith({
      agent: mockRows[1],
      prompt,
    });
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/sessions/gazelle/session-3',
      {
        state: {
          newSession: {
            text: prompt,
            agentNamespace: 'kagent',
            agentName: 'workflow-manager',
          },
        },
      },
    );
  }, 30_000);

  it('stays on the overview and says why when the session could not start', async () => {
    configuredRoles = { workflowManagement: 'workflow-manager' };
    mockCreationError = new Error('kagent is unreachable');
    createSession.mockRejectedValue(mockCreationError);
    await renderAssist();

    await userEvent.click(
      screen.getByRole('button', { name: 'Create with Flo' }),
    );

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      screen.getByText('Could not start a session with Flo'),
    ).toBeInTheDocument();
    expect(screen.getByText('kagent is unreachable')).toBeInTheDocument();
  }, 30_000);
});
