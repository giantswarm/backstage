import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { sessionsRouteRef } from '../../routes';
import type { AgentsContextValue } from '../AgentsDataProvider';
import type { SessionDetailView } from '../../hooks/useSessionDetail';
import { buildTimeline } from '../../lib/kagentTimeline';
import { normalizeTaskList } from '../../lib/kagentSessionDetail';
import { normalizeSessionDetail } from '../../lib/kagentSessionDetail';
import { deriveSessionState } from '../../lib/kagentSessionState';
import { SessionDetailPage } from './SessionDetailPage';

import tasksV099 from '../../lib/__fixtures__/tasks.v0-9-9.json';
import detailV099 from '../../lib/__fixtures__/session-detail.v0-9-9.json';

// The route params the page reads. Driven directly rather than through a router so
// each state can be rendered in isolation.
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ installation: 'gazelle', sessionId: 'abc' }),
}));

const mockUseSessionDetail = jest.fn<SessionDetailView, []>();
jest.mock('../../hooks/useSessionDetail', () => ({
  useSessionDetail: () => mockUseSessionDetail(),
}));

const mockUseAgents = jest.fn<AgentsContextValue, []>();
jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useAgents: () => mockUseAgents(),
}));

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => 'https://avatars.example/agent.png',
}));

const tasks = normalizeTaskList(tasksV099).tasks;
const timeline = buildTimeline(tasks);
const detail = normalizeSessionDetail(detailV099, 'gazelle').detail!;

const loadedView: SessionDetailView = {
  detail,
  timeline,
  state: deriveSessionState(tasks),
  taskCount: tasks.length,
  isLoading: false,
  isNotFound: false,
  error: undefined,
};

const emptyTimeline = {
  items: [],
  tokens: timeline.tokens,
  skippedMessages: 0,
};

async function render() {
  await renderInTestApp(<SessionDetailPage />, {
    mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
  });
}

describe('SessionDetailPage', () => {
  beforeEach(() => {
    mockUseSessionDetail.mockReturnValue(loadedView);
    mockUseAgents.mockReturnValue({
      rows: [
        {
          id: 'gazelle/kagent/issue-tracker',
          installation: 'gazelle',
          namespace: 'kagent',
          name: 'Issue tracker',
          technicalName: 'issue-tracker',
        },
      ],
      isLoading: false,
      isLoadingMore: false,
      hasInstallations: true,
      unreachableInstallations: [],
    } as unknown as AgentsContextValue);
  });

  it('shows the session, its agent and its installation', async () => {
    await render();

    expect(screen.getByText('Which GitHub issues...')).toBeInTheDocument();
    // Resolved through the same Agent CR join the list uses, so both name it
    // identically rather than showing the raw `issue_tracker` identifier. Appears
    // twice on purpose: in the header, and as the author of its messages.
    expect(screen.getAllByText('Issue tracker').length).toBeGreaterThan(0);
    expect(screen.getByText('on gazelle')).toBeInTheDocument();
  });

  it('shows the state from the most recent task', async () => {
    // The fixture's last task is `working`; an earlier one completed. Reporting the
    // earlier one would claim a running session had finished.
    await render();

    expect(screen.getByText('Working')).toBeInTheDocument();
  });

  it('labels token totals as cumulative, since the raw number is startling', async () => {
    // Every model call re-sends the whole context, so a short session can total
    // millions of prompt tokens. Genuine billed usage, but it reads as a bug
    // without the label.
    await render();

    expect(
      screen.getByText('Input tokens (billed, cumulative)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Turns')).toBeInTheDocument();
  });

  it('renders the timeline', async () => {
    await render();

    expect(screen.getByText(/You have two open issues/)).toBeInTheDocument();
  });

  it('shows a not-found state rather than an error for a missing session', async () => {
    // kagent answers 404 for deleted, never-existed and someone-else's alike, so
    // all three land here — and none of them is a fault worth an error alert.
    mockUseSessionDetail.mockReturnValue({
      ...loadedView,
      detail: undefined,
      timeline: emptyTimeline,
      isNotFound: true,
    });

    await render();

    expect(screen.getByText('Session not found')).toBeInTheDocument();
    expect(
      screen.queryByText('Could not load this session'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Back to sessions')).toBeInTheDocument();
  });

  it('surfaces a genuine read failure with its message', async () => {
    const error = new Error('kagent returned status 500');
    error.name = 'UpstreamError';
    mockUseSessionDetail.mockReturnValue({
      ...loadedView,
      detail: undefined,
      timeline: emptyTimeline,
      error,
    });

    await render();

    expect(screen.getByText('Could not load this session')).toBeInTheDocument();
    expect(screen.getByText(/status 500/)).toBeInTheDocument();
  });

  it('shows progress while loading', async () => {
    mockUseSessionDetail.mockReturnValue({
      ...loadedView,
      detail: undefined,
      timeline: emptyTimeline,
      isLoading: true,
    });

    await render();

    // `Progress` renders a hidden placeholder until a ~250ms timer fires, so it
    // doesn't flash for fast loads. `data-testid="progress"` is present in both
    // states and is the hook it ships for exactly this.
    expect(screen.getByTestId('progress')).toBeInTheDocument();
    expect(screen.queryByText('Session not found')).not.toBeInTheDocument();
  });

  it('says so when a session has no activity at all', async () => {
    // A session created but never run: distinct from every state kagent can
    // report, so it must not borrow one of them.
    mockUseSessionDetail.mockReturnValue({
      ...loadedView,
      timeline: emptyTimeline,
      state: undefined,
      taskCount: 0,
    });

    await render();

    expect(screen.getByText('no activity')).toBeInTheDocument();
    expect(
      screen.getByText('This session has no messages yet.'),
    ).toBeInTheDocument();
  });
});
