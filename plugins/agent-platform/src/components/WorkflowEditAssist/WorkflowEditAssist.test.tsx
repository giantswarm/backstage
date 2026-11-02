import type { ReactNode } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';

import {
  workflowEditPrompt,
  type WorkflowEditTarget,
} from '../../lib/workflowAgentPrompts';
import { sessionsRouteRef } from '../../routes';
import type { AgentRow } from '../AgentsDataProvider';
import { WorkflowEditAssist } from './WorkflowEditAssist';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

let mockTarget: WorkflowEditTarget | undefined;
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  useWorkflowPageTarget: () => mockTarget,
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

const TARGET: WorkflowEditTarget = {
  name: 'deploy',
  installation: 'gazelle',
  toolName: 'workflow_deploy',
  gitOps: false,
  definitionYaml: 'name: deploy\nsteps:\n  -\n    id: fetch\n    tool: x_get',
};

function renderAssist() {
  // In a stand-in for ShellPage's header-actions row, where the page puts it.
  return renderInTestApp(
    <div data-testid="header-actions">
      <WorkflowEditAssist />
    </div>,
    {
      mountedRoutes: { '/sessions': sessionsRouteRef },
    },
  );
}

beforeEach(() => {
  configuredRoles = {};
  mockTarget = TARGET;
  mockRows = [agent('swarm-operator'), agent('workflow-manager', 'Flo')];
  mockCreationError = null;
  createSession.mockReset();
  mockNavigate.mockReset();
  mockUseCreateSession.mockReset();
  mockAgentsRead.mockReset();
});

describe('WorkflowEditAssist', () => {
  it('renders nothing, and reads no agents, while the workflowManagement role is unconfigured', async () => {
    await renderAssist();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(mockAgentsRead).not.toHaveBeenCalled();
  });

  it('renders nothing outside a workflow page', async () => {
    configuredRoles = { workflowManagement: 'kagent/workflow-manager' };
    mockTarget = undefined;
    await renderAssist();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing when the configured agent does not exist', async () => {
    configuredRoles = { workflowManagement: 'kagent/gone-agent' };
    await renderAssist();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing when the role names the agent without its namespace', async () => {
    configuredRoles = { workflowManagement: 'workflow-manager' };
    await renderAssist();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing when the configured agent cannot take a session', async () => {
    configuredRoles = { workflowManagement: 'kagent/workflow-manager' };
    mockRows = [agent('workflow-manager', 'Flo', 'notReady')];
    await renderAssist();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is a secondary button straight in the header-actions row, as the skill page’s Edit', async () => {
    configuredRoles = { workflowManagement: 'kagent/workflow-manager' };
    await renderAssist();

    const button = screen.getByRole('button', { name: 'Edit with Flo' });
    // No wrapper of its own between it and the row.
    expect(button.parentElement).toBe(screen.getByTestId('header-actions'));
    expect(button).toHaveAttribute('data-variant', 'secondary');
  });

  it('starts a session with the workflow agent about this workflow and opens it', async () => {
    configuredRoles = { workflowManagement: 'kagent/workflow-manager' };
    createSession.mockResolvedValue('session-7');
    await renderAssist();

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit with Flo' }),
    );

    // Reported as the existing session-start event, from this entry point.
    expect(mockUseCreateSession).toHaveBeenCalledWith('workflowEdit');
    const prompt = workflowEditPrompt(TARGET);
    expect(prompt).toContain(
      'I\'d like to edit the workflow "deploy" on the gazelle installation',
    );
    expect(createSession).toHaveBeenCalledWith({
      agent: mockRows[1],
      prompt,
    });
    expect(mockNavigate).toHaveBeenCalledWith('/sessions/gazelle/session-7', {
      state: {
        newSession: {
          text: prompt,
          agentNamespace: 'kagent',
          agentName: 'workflow-manager',
          prepared: true,
        },
      },
    });
  }, 30_000);

  it('stays on the page and says why when the session could not start', async () => {
    configuredRoles = { workflowManagement: 'kagent/workflow-manager' };
    mockCreationError = new Error('kagent is unreachable');
    createSession.mockRejectedValue(mockCreationError);
    await renderAssist();

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit with Flo' }),
    );

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not start a session with Flo: kagent is unreachable',
    );
  }, 30_000);
});
