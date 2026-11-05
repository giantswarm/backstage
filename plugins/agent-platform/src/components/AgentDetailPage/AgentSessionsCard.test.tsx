import { renderInTestApp } from '@backstage/frontend-test-utils';
import { fireEvent, screen } from '@testing-library/react';
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
  retry: () => {},
  isRetrying: false,
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

  it('says why the sessions could not be read and offers to read them again', async () => {
    const retry = jest.fn();
    await renderInTestApp(
      <AgentSessionsCard
        agentName="Swarmgeist"
        sessions={{
          ...sessions,
          rows: [],
          isUnavailable: true,
          failure: { reason: 'temporarily unavailable', requestId: 'req-3' },
          retry,
        }}
        onStartSession={() => {}}
      />,
      { mountedRoutes: { '/sessions': sessionsRouteRef } },
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not read your sessions');
    expect(alert).toHaveTextContent(
      'The sessions could not be read on gazelle (temporarily unavailable, request id req-3).',
    );
    // Not the empty state: no claim of no sessions, no invitation to start one.
    expect(
      screen.queryByText('You have no sessions with this agent.'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('keeps a quiet line, without a retry, when kagent is not deployed there', async () => {
    await renderInTestApp(
      <AgentSessionsCard
        agentName="Swarmgeist"
        sessions={{ ...sessions, rows: [], isUnavailable: true }}
      />,
      { mountedRoutes: { '/sessions': sessionsRouteRef } },
    );

    expect(
      screen.getByText('Sessions could not be read from this environment.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
  });
});
