import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// The page calls all of these on the menu's behalf, because the menu renders in
// the shared header — outside the plugin's QueryClientProvider — and so cannot call
// them itself. This test mounts no query client, which is why they are stubbed.
const mockDeleteSession = jest.fn();
jest.mock('../../hooks/useDeleteSession', () => ({
  useDeleteSession: () => ({
    deleteSession: mockDeleteSession,
    isDeleting: false,
    error: null,
    reset: jest.fn(),
  }),
}));

const mockRenameSession = jest.fn();
jest.mock('../../hooks/useRenameSession', () => ({
  useRenameSession: () => ({
    renameSession: mockRenameSession,
    isRenaming: false,
    error: null,
    reset: jest.fn(),
  }),
}));

jest.mock('../../hooks/useKagentCapabilities', () => ({
  useKagentCapabilities: () => ({ isUserScoped: true }),
}));

/** What the page handed to the shared header slot on the last render. */
const providedActions = jest.fn();
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  useProvidePageHeaderActions: (actions: ReactNode) => providedActions(actions),
}));

const tasks = normalizeTaskList(tasksV099).tasks;
const timeline = buildTimeline(tasks);
const detail = normalizeSessionDetail(detailV099, 'gazelle').detail!;

const loadedView: SessionDetailView = {
  detail,
  timeline,
  state: deriveSessionState(tasks),
  taskCount: tasks.length,
  hasConversation: true,
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

/** The last element the page provided as header actions. */
function lastProvidedActions() {
  const calls = providedActions.mock.calls;
  return calls[calls.length - 1]?.[0];
}

describe('SessionDetailPage', () => {
  beforeEach(() => {
    providedActions.mockClear();
    mockRenameSession.mockReset();
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

  it('offers the actions menu once the session is loaded', async () => {
    await render();

    expect(lastProvidedActions()).not.toBeNull();
  });

  it.each([
    ['a missing session', { detail: undefined, isNotFound: true }],
    ['a failed read', { detail: undefined, error: new Error('nope') }],
    ['a load in flight', { detail: undefined, isLoading: true }],
  ])('offers no actions for %s', async (_label, view) => {
    // A delete needs a session to delete. Registering the menu regardless would put
    // a kebab in the header of a page that is showing "Session not found".
    mockUseSessionDetail.mockReturnValue({
      ...loadedView,
      timeline: emptyTimeline,
      ...view,
    });

    await render();

    expect(lastProvidedActions()).toBeNull();
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
    expect(screen.getByText('Output tokens')).toBeInTheDocument();
  });

  it('shows the wall-clock duration', async () => {
    // kagent records no per-turn durations, so this is updated_at - created_at:
    // the session's span, including time the user was away.
    await render();

    expect(screen.getByText('Duration')).toBeInTheDocument();
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
    // Specifically the *no data* case — an error with a session already in hand is
    // a stale-refresh notice instead, see the test below. The two are a pair.
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

  it('keeps the session on screen when a refresh fails', async () => {
    // These reads poll, so an error can arrive on a page that is already showing a
    // perfectly real conversation. Replacing it would mean one proxy hiccup blanks
    // the session someone is reading, for up to a minute.
    const error = new Error('kagent is unavailable');
    error.name = 'ServiceUnavailableError';
    mockUseSessionDetail.mockReturnValue({ ...loadedView, error });

    await render();

    expect(screen.getByText('Which GitHub issues...')).toBeInTheDocument();
    expect(screen.getByText(/You have two open issues/)).toBeInTheDocument();
    expect(
      screen.queryByText('Could not load this session'),
    ).not.toBeInTheDocument();

    // Said out loud, so a conversation that has quietly stopped keeping up does
    // not read as an agent that stopped producing output.
    expect(
      screen.getByText('This session may be out of date'),
    ).toBeInTheDocument();
    expect(screen.getByText(/kagent is unavailable/)).toBeInTheDocument();

    // A failed poll must not strip the kebab either.
    expect(lastProvidedActions()).not.toBeNull();
  });

  it('does not fabricate an empty session when the conversation never loaded', async () => {
    // The two reads fail independently. With the session read fine and the tasks
    // read failing on *first* load, the timeline/turns/tokens are absent, not empty
    // — rendering them would claim "no activity", "Turns 0" and "no messages yet"
    // about a session that has a full conversation.
    const error = new Error('kagent is unavailable');
    error.name = 'ServiceUnavailableError';
    mockUseSessionDetail.mockReturnValue({
      ...loadedView,
      timeline: emptyTimeline,
      taskCount: 0,
      state: undefined,
      hasConversation: false,
      error,
    });

    await render();

    expect(screen.getByText('Could not load this session')).toBeInTheDocument();
    expect(screen.getByText(/kagent is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText('no activity')).not.toBeInTheDocument();
    expect(screen.queryByText('Turns')).not.toBeInTheDocument();
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

  describe('renaming', () => {
    it('makes the title a way in, not just a label', async () => {
      // The kebab is the discoverable route; the title is the obvious one. It is a
      // real button rather than a click handler on the heading, so it is reachable
      // by keyboard and announced as something you can press.
      await render();

      await userEvent.click(
        screen.getByRole('button', {
          name: 'Rename session "Which GitHub issues..."',
        }),
      );

      expect(
        await screen.findByRole('textbox', { name: /Session name/ }),
      ).toHaveValue('Which GitHub issues...');
    });

    it('submits the new name and closes', async () => {
      mockRenameSession.mockResolvedValue(undefined);
      await render();

      await userEvent.click(
        screen.getByRole('button', {
          name: 'Rename session "Which GitHub issues..."',
        }),
      );
      const field = await screen.findByRole('textbox', {
        name: /Session name/,
      });
      await userEvent.clear(field);
      await userEvent.type(field, 'Issues assigned to me');
      await userEvent.click(screen.getByRole('button', { name: /Save/ }));

      await waitFor(() =>
        expect(mockRenameSession).toHaveBeenCalledWith('Issues assigned to me'),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('textbox', { name: /Session name/ }),
        ).not.toBeInTheDocument(),
      );
    });

    it('keeps the dialog open when the rename fails', async () => {
      // Unlike the delete, nothing navigates away — so the dialog is where the
      // failure has to be reported, and closing it would hide it.
      mockRenameSession.mockRejectedValue(new Error('kagent said no'));
      await render();

      await userEvent.click(
        screen.getByRole('button', {
          name: 'Rename session "Which GitHub issues..."',
        }),
      );
      await userEvent.click(
        await screen.findByRole('button', { name: /Save/ }),
      );

      await waitFor(() => expect(mockRenameSession).toHaveBeenCalled());
      expect(
        screen.getByRole('textbox', { name: /Session name/ }),
      ).toBeInTheDocument();
    });
  });
});
