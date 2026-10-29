import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { FleetSessionStatesView } from '../../hooks/useFleetSessionStates';
import { AgentSessionsView } from '../../hooks/useAgentSessions';
import { SessionRow } from '../SessionsDataProvider/helpers';
import { sessionsRouteRef } from '../../routes';
import { AgentSessionsCard } from './AgentSessionsCard';

// The sessions here start without a workspace: nothing to name, nothing read.
const mockNoWorkspaceName = () => undefined;
jest.mock('../../hooks/useWorkspaceNames', () => ({
  ...jest.requireActual('../../hooks/useWorkspaceNames'),
  useWorkspaceNames: () => mockNoWorkspaceName,
}));

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => undefined,
}));

jest.mock('../../hooks/useDeleteSession', () => ({
  useDeleteSession: () => ({
    deleteSession: jest.fn(),
    isDeleting: false,
    isDeleted: false,
    error: null,
    reset: jest.fn(),
  }),
}));

jest.mock('../../hooks/useRenameSession', () => ({
  useRenameSession: () => ({
    renameSession: jest.fn(),
    isRenaming: false,
    error: null,
    reset: jest.fn(),
  }),
}));

jest.mock('../../hooks/useKagentCapabilities', () => ({
  useKagentCapabilities: () => ({ isUserScoped: true }),
}));

const states: FleetSessionStatesView = {
  states: new Map<string, SessionStateEntry>([
    ['gazelle/a', { sessionId: 'a', state: 'input-required' }],
    ['gazelle/b', { sessionId: 'b', state: 'completed' }],
  ]),
  unreadable: new Set(),
  failedInstallations: new Set(),
  skippedCount: 0,
  isLoading: false,
  isComplete: true,
  isError: false,
};

jest.mock('../../hooks/useFleetSessionStates', () => ({
  useFleetSessionStates: () => states,
}));

function session(sessionId: string, title: string): SessionRow {
  return {
    id: `gazelle/${sessionId}`,
    sessionId,
    installation: 'gazelle',
    title,
    agentName: 'Swarmgeist',
    agentNamespace: 'kagent',
    agentTechnicalName: 'swarmgeist',
    createdAt: new Date().toISOString(),
  };
}

const sessions: AgentSessionsView = {
  rows: [session('a', 'Check the clusters'), session('b', 'Release notes')],
  installation: 'gazelle',
  isLoading: false,
  isNotUserScoped: false,
  isUnavailable: false,
};

describe('AgentSessionsCard', () => {
  it('marks the sessions started on an earlier revision of the agent, and only those', async () => {
    await renderInTestApp(
      <AgentSessionsCard
        agentName="Swarmgeist"
        currentRevision="rev-2"
        sessions={{
          ...sessions,
          rows: [
            {
              ...session('a', 'Check the clusters'),
              preparedRevision: 'rev-1',
            },
            { ...session('b', 'Release notes'), preparedRevision: 'rev-2' },
          ],
        }}
      />,
      { mountedRoutes: { '/sessions': sessionsRouteRef } },
    );

    const marks = await screen.findAllByText('Earlier revision');
    expect(marks).toHaveLength(1);
    expect(marks[0].closest('[role="row"]')).toHaveTextContent(
      'Check the clusters',
    );
  });

  it("lists the agent's few sessions as the Sessions page does: its words, no paging, no search", async () => {
    await renderInTestApp(
      <AgentSessionsCard agentName="Swarmgeist" sessions={sessions} />,
      { mountedRoutes: { '/sessions': sessionsRouteRef } },
    );

    expect(
      screen.getByText('These are your sessions with Swarmgeist.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Check the clusters')).toBeInTheDocument();
    // The Sessions page's state words, not the classic list's.
    expect(screen.getByText('Waiting for you')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
    // Two rows: no pagination chrome and nothing to search or filter.
    expect(screen.queryByText(/of 2/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Show 25/)).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    // Every row is this agent's: no Agent column.
    expect(
      screen.queryByRole('columnheader', { name: 'Agent' }),
    ).not.toBeInTheDocument();
  });
});
