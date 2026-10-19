import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import {
  storageApiRef,
  toastApiRef,
  type StorageApi,
} from '@backstage/frontend-plugin-api';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';

import { agentsRouteRef, sessionsRouteRef } from '../../routes';
import type { AgentsContextValue } from '../AgentsDataProvider';
import type { SessionDetailView } from '../../hooks/useSessionDetail';
import type {
  PendingAnswer,
  UseAnswerConfirmationResult,
} from '../../hooks/useAnswerConfirmation';
import type { UseCancelTaskResult } from '../../hooks/useCancelTask';
import type { UseCreateSessionResult } from '../../hooks/useCreateSession';
import type { UseSendMessageResult } from '../../hooks/useSendMessage';
import { createStreamTurn } from '../../lib/kagentStreamTurn';
import { buildTimeline, type TimelineItem } from '../../lib/kagentTimeline';
import { TINY_PNG_BASE64 } from '../../lib/__fixtures__/images';
import {
  deriveSessionState,
  normalizeSessionDetail,
  normalizeTaskList,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { buildContinuationPrompt } from '../../lib/continuationPrompt';
import { SessionDetailPage } from './SessionDetailPage';
import {
  mockCollapsibleLayout,
  mockDesktopLayout,
  mockIntersectionObserver,
  mockPhoneLayout,
  type MockedCollapsibleLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';

import {
  sessionDetailV099 as detailV099,
  tasksClaudeHarness,
  tasksV099,
} from '@giantswarm/backstage-plugin-agent-platform-common/testFixtures';

// The route params the page reads. Driven directly rather than through a router so
// each state can be rendered in isolation. The navigation is the page's own only
// on the way out of a lost runtime (to the new session), which is what the mock
// observes.
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ installation: 'gazelle', sessionId: 'abc' }),
  useNavigate: () => mockNavigate,
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

jest.mock('../../hooks/useMusterServers', () => ({
  useMusterServers: () => ({
    servers: [],
    resources: [],
    labels: new Map(),
    isLoading: false,
    isUnavailable: false,
  }),
}));

jest.mock('../../hooks/useKagentCapabilities', () => ({
  useKagentCapabilities: () => ({ isUserScoped: true }),
}));

// Stubbed for the same reason as the write hooks below: it reaches Mimir
// through the gs plugin's api ref, and this test mounts no APIs. An empty
// `rates` makes the estimated cost read "—", which is asserted explicitly in
// one test rather than assumed away here. A test that needs a priced estimate
// sets `mockPricedRate`; `beforeEach` clears it.
let mockPricedRate: number | undefined;
jest.mock('../../hooks/useTokenRates', () => ({
  useTokenRates: () => ({
    rates: mockPricedRate === undefined ? {} : { blended: mockPricedRate },
    tier: mockPricedRate === undefined ? 'none' : 'installation',
    model: undefined,
    isLoading: false,
    isAvailable: true,
    window: '7d',
  }),
}));

// Stubbed like `useTokenRates`: it reads Mimir through the gs plugin's api ref.
// The refusals on a timeline are covered in SessionTimeline's tests.
jest.mock('../../hooks/useSessionEgressRefusals', () => ({
  useSessionEgressRefusals: () => [],
}));

// Stubbed for the same reason as the mutations above: no query client is mounted.
const mockSendMessage = jest.fn();
const mockUseSendMessage = jest.fn<UseSendMessageResult, []>();
jest.mock('../../hooks/useSendMessage', () => ({
  useSendMessage: () => mockUseSendMessage(),
}));

// Stubbed like the other write hooks: it reads `kagentApiRef`, and this test mounts
// no APIs and no query client.
const mockAnswer = jest.fn();
const mockUseAnswerConfirmation = jest.fn<UseAnswerConfirmationResult, []>();
jest.mock('../../hooks/useAnswerConfirmation', () => ({
  // The real error classifier, so the page reads the hook's errors as it will.
  ...jest.requireActual('../../hooks/useAnswerConfirmation'),
  useAnswerConfirmation: () => mockUseAnswerConfirmation(),
}));

// Stubbed like the other write hooks: it reads `kagentApiRef`, and this test mounts
// no APIs and no query client.
const mockCancelTask = jest.fn();
const mockUseCancelTask = jest.fn<UseCancelTaskResult, []>();
jest.mock('../../hooks/useCancelTask', () => ({
  useCancelTask: () => mockUseCancelTask(),
}));

function idleCancel(
  overrides: Partial<UseCancelTaskResult> = {},
): UseCancelTaskResult {
  return {
    cancelTask: mockCancelTask,
    isCancelling: false,
    error: null,
    reset: jest.fn(),
    ...overrides,
  };
}

// Stubbed like the other write hooks: it reads `kagentApiRef` and mutates
// through react-query, and this test mounts neither. The page calls it for the
// way out of a lost runtime — a new session with the same agent.
const mockCreateSession = jest.fn();
const mockUseCreateSession = jest.fn<UseCreateSessionResult, []>();
jest.mock('../../hooks/useCreateSession', () => ({
  useCreateSession: () => mockUseCreateSession(),
}));

function idleCreation(
  overrides: Partial<UseCreateSessionResult> = {},
): UseCreateSessionResult {
  return {
    createSession: mockCreateSession,
    isCreating: false,
    error: null,
    reset: jest.fn(),
    ...overrides,
  };
}

/** The hook's idle state, which most tests want. */
function idleConfirmation(
  overrides: Partial<UseAnswerConfirmationResult> = {},
): UseAnswerConfirmationResult {
  return {
    answer: mockAnswer,
    isAnswering: false,
    pending: null,
    stream: null,
    isStreamLost: false,
    failed: null,
    error: null,
    reset: jest.fn(),
    ...overrides,
  };
}

// The prompt a just-created session was started with. Mocked rather than driven
// through router state, because the hook's own contract — read once, then clear the
// state — has its own tests; what matters here is that the page dispatches it.
const mockUseNewSessionHandoff = jest.fn();
// The images a new session is opened with, as the page hands them over.
const mockStashHandoffImages = jest.fn();
jest.mock('../../hooks/useNewSessionHandoff', () => {
  const actual = jest.requireActual('../../hooks/useNewSessionHandoff');
  return {
    ...actual,
    useNewSessionHandoff: () => mockUseNewSessionHandoff(),
    stashHandoffImages: (images: unknown) => {
      mockStashHandoffImages(images);
      return actual.stashHandoffImages(images);
    },
  };
});

/** The hook's idle state, which most tests want. */
/** An image of a message in flight, as the composer prepared it. */
const PENDING_IMAGE = {
  id: 'image-1',
  name: 'shot.png',
  mediaType: 'image/png' as const,
  byteSize: 70,
  previewUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
};

/**
 * The timeline with an image attached to the last message the person sent,
 * as the poll reads one back.
 */
function withImageOnLastMessage(view: SessionDetailView): SessionDetailView {
  const last = [...view.timeline.items]
    .reverse()
    .find(item => item.kind === 'user-message')!;
  return {
    ...view,
    timeline: {
      ...view.timeline,
      items: [
        ...view.timeline.items,
        {
          kind: 'attachment',
          id: 'sent-image',
          taskIndex: last.taskIndex,
          messageId: last.messageId,
          isUser: true,
          name: 'shot.png',
          preview: {
            kind: 'image',
            type: 'image/png',
            dataUrl: PENDING_IMAGE.previewUrl,
            byteSize: PENDING_IMAGE.byteSize,
          },
        },
      ],
    },
  };
}

function idleSend(
  overrides: Partial<UseSendMessageResult> = {},
): UseSendMessageResult {
  return {
    sendMessage: mockSendMessage,
    isSending: false,
    pending: null,
    stream: null,
    isStreamLost: false,
    failed: null,
    error: null,
    reset: jest.fn(),
    ...overrides,
  };
}

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
  // The fixture's newest task is `working`. Its timestamp is long past the
  // staleness bound, so the real hook would call it stale — set explicitly here so
  // these tests describe a live turn rather than depending on a fixture's age.
  isAgentWorking: true,
  taskCount: tasks.length,
  hasConversation: true,
  isLoading: false,
  isNotFound: false,
  error: undefined,
};

/** The state a session sits in while a confirmation is open. */
const awaitingInput = {
  raw: 'input-required',
  key: 'input-required',
  label: 'Waiting for you',
  tone: 'warning' as const,
  isActive: true,
};

const emptyTimeline = {
  items: [],
  tokens: timeline.tokens,
  skippedMessages: 0,
};

async function render(
  apis?: NonNullable<Parameters<typeof renderInTestApp>[1]>['apis'],
) {
  return renderInTestApp(<SessionDetailPage />, {
    apis,
    // `agentsRouteRef` is here for the link on the agent's name, which resolves
    // through `agentDetailRouteRef` — a SubRouteRef, which `mountedRoutes` does not
    // take, so its parent is what gets mounted.
    mountedRoutes: {
      '/sessions': sessionsRouteRef,
      '/customize/agents': agentsRouteRef,
    },
  });
}

/** The last element the page provided as header actions. */
function lastProvidedActions() {
  const calls = providedActions.mock.calls;
  return calls[calls.length - 1]?.[0];
}

describe('SessionDetailPage', () => {
  beforeEach(() => {
    mockPricedRate = undefined;
    providedActions.mockClear();
    mockRenameSession.mockReset();
    mockSendMessage.mockReset();
    mockSendMessage.mockResolvedValue(undefined);
    mockUseSendMessage.mockReturnValue(idleSend());
    mockUseNewSessionHandoff.mockReturnValue(undefined);
    mockStashHandoffImages.mockReset();
    mockAnswer.mockReset();
    mockAnswer.mockResolvedValue(undefined);
    mockUseAnswerConfirmation.mockReturnValue(idleConfirmation());
    mockCancelTask.mockReset();
    mockCancelTask.mockResolvedValue(undefined);
    mockUseCancelTask.mockReturnValue(idleCancel());
    mockCreateSession.mockReset();
    mockCreateSession.mockResolvedValue('new-1');
    mockUseCreateSession.mockReturnValue(idleCreation());
    mockNavigate.mockReset();
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
    // The installation as a chip in the header, the same chip the agent and
    // model pages carry.
    expect(screen.getByTestId('installation-chip')).toHaveTextContent(
      'gazelle',
    );
  });

  it('offers no share — shared sessions have no UI surface yet', async () => {
    // The backend's share routes exist for kagent-compatible clients, but the
    // portal cannot open a session from a token, so the UI offers no share.
    await render();

    expect(
      screen.queryByRole('button', { name: /share/i }),
    ).not.toBeInTheDocument();
  });

  it('links the agent name to the agent, so a session is a way in to it', async () => {
    await render();

    // By role, because the name also appears as the author of every message the
    // agent sent — as text, so only the header one is a link.
    expect(screen.getByRole('link', { name: 'Issue tracker' })).toHaveAttribute(
      'href',
      '/customize/agents/gazelle/kagent/issue-tracker',
    );
  });

  it('leaves the agent name as text when no Agent matched the session', async () => {
    // Without the CR there is no namespace and no real name, so there is no agent
    // page to point at — the header falls back to the lossy decode of the
    // session's `agent_id`, which must not look clickable.
    mockUseAgents.mockReturnValue({
      rows: [],
      isLoading: false,
      isLoadingMore: false,
      hasInstallations: true,
      unreachableInstallations: [],
    } as unknown as AgentsContextValue);
    await render();

    expect(screen.queryByRole('link', { name: /issue.tracker/i })).toBeNull();
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

  it('puts the session totals behind the composer’s chip', async () => {
    // The prototype's cost + context popover: tokens, turns and costs live
    // behind one chip in the composer's controls — always on screen with the
    // docked box — rather than in the page header, which scrolls away.
    await render();

    const chip = screen.getByRole('button', {
      name: /Session cost and context/,
    });
    expect(
      within(screen.getByTestId('composer-card')).getByRole('button', {
        name: /Session cost and context/,
      }),
    ).toBe(chip);
    await userEvent.click(chip);

    expect(screen.getByText('Tokens in / out')).toBeInTheDocument();
    expect(screen.getByText('Turns')).toBeInTheDocument();
    expect(screen.getByText('Est. cost')).toBeInTheDocument();
    expect(screen.getByText('Context used')).toBeInTheDocument();
  });

  it('keeps the chip in reach when the composer is withheld', async () => {
    // A read-only share has no box to carry the chip, but its cost is still
    // worth seeing — the chip docks beside the withheld reason instead.
    mockUseSessionDetail.mockReturnValue({
      ...loadedView,
      detail: { ...detail, readOnly: true },
    });
    await render();

    expect(
      screen.getByRole('button', { name: /Session cost and context/ }),
    ).toBeInTheDocument();
  });

  it('shows the cost a claude Harness turn reported beside the estimate', async () => {
    const claudeTasks = normalizeTaskList(tasksClaudeHarness).tasks;
    mockUseSessionDetail.mockReturnValue({
      ...loadedView,
      timeline: buildTimeline(claudeTasks),
      taskCount: claudeTasks.length,
    });
    await render();

    await userEvent.click(
      screen.getByRole('button', { name: /Session cost and context/ }),
    );

    expect(screen.getByText('Est. cost')).toBeInTheDocument();
    expect(screen.getByText('Reported cost')).toBeInTheDocument();
    // Twice on purpose: the chip leads with the reported figure, and the
    // popover row repeats it beside its label.
    expect(screen.getAllByText('$0.131').length).toBeGreaterThan(0);
  });

  it('names the tokens the estimate priced as the rows above it show them', async () => {
    // The reported session: kagent's total of 48,478 tokens, in exact digits
    // in the basis line, sat under an input count reading 48.0k and looked
    // like a rounding error. The basis now names the counts the rows show.
    mockPricedRate = 0.000003;
    mockUseSessionDetail.mockReturnValue({
      ...loadedView,
      timeline: {
        ...timeline,
        tokens: { total: 48_478, prompt: 48_012, completion: 466 },
      },
    });
    await render();

    await userEvent.click(
      screen.getByRole('button', { name: /Session cost and context/ }),
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Session cost and context',
    });
    expect(within(dialog).getByText('48.0k / 466')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /applied to the 48\.0k input and 466 output tokens/,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/48,478/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/other tokens/)).not.toBeInTheDocument();
  });

  it('says how many tokens the estimate leaves unpriced', async () => {
    // Thinking a model reports apart from its output is in kagent's total and
    // in neither part, so the estimate does not price it, and the line says so.
    mockPricedRate = 0.000003;
    mockUseSessionDetail.mockReturnValue({
      ...loadedView,
      timeline: {
        ...timeline,
        tokens: { total: 68_478, prompt: 48_012, completion: 466 },
      },
    });
    await render();

    await userEvent.click(
      screen.getByRole('button', { name: /Session cost and context/ }),
    );

    expect(
      within(
        screen.getByRole('dialog', { name: 'Session cost and context' }),
      ).getByText(/kagent also counted 20\.0k other tokens, such as thinking/),
    ).toBeInTheDocument();
  });

  it('shows no reported cost when the runtime reports none', async () => {
    await render();

    await userEvent.click(
      screen.getByRole('button', { name: /Session cost and context/ }),
    );

    expect(screen.getByText('Est. cost')).toBeInTheDocument();
    expect(screen.queryByText('Reported cost')).not.toBeInTheDocument();
  });

  it('shows the start but no last activity or duration', async () => {
    // kagent API v2 does not move updated_at on a turn, so both would only
    // restate the start (kagent-dev/kagent#2397).
    await render();

    expect(screen.getByText(/^Started/)).toBeInTheDocument();
    expect(screen.queryByText(/last activity/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
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
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument();
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
      isAgentWorking: false,
    });

    await render();

    expect(screen.getByText('No activity yet')).toBeInTheDocument();
    expect(
      screen.getByText('This session has no messages yet.'),
    ).toBeInTheDocument();
  });

  it('says Working in the header from the moment a message is sent (T100 H4)', async () => {
    // The first beat of a session started from the home composer: no poll has
    // seen a task yet, so the conversation alone would say "no activity" while
    // the body already says "Working…". The header follows the body.
    mockUseSessionDetail.mockReturnValue({
      ...loadedView,
      timeline: emptyTimeline,
      state: undefined,
      taskCount: 0,
      isAgentWorking: false,
    });
    mockUseSendMessage.mockReturnValue(idleSend({ isSending: true }));

    await render();

    expect(screen.getByText('Working')).toBeInTheDocument();
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument();
  });

  describe('opening', () => {
    // Live round 2 (R8): a long session opened at its top (scrollTop 0 of
    // 6148). The PO's model is a desktop chat app, which opens at the newest
    // message.
    let scrollTop = 0;
    let spies: jest.SpyInstance[] = [];
    beforeEach(() => {
      scrollTop = 0;
      const root = document.documentElement;
      spies = [
        jest.spyOn(root, 'scrollHeight', 'get').mockReturnValue(6148),
        jest
          .spyOn(root, 'scrollTop', 'get')
          .mockImplementation(() => scrollTop),
        jest.spyOn(root, 'scrollTop', 'set').mockImplementation(value => {
          scrollTop = value;
        }),
      ];
    });
    afterEach(() => spies.forEach(spy => spy.mockRestore()));

    it('opens at the newest turn', async () => {
      await render();

      await screen.findByTestId('session-dock');
      expect(scrollTop).toBe(6148);
    });

    it('leaves the reader where they scrolled once it has opened', async () => {
      await render();
      await screen.findByTestId('session-dock');
      // The open settles: its second scroll lands a frame later.
      await act(
        () =>
          new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
      );

      // Scrolled up to read; the page renders again (here: typing a reply).
      scrollTop = 120;
      await userEvent.type(
        screen.getByRole('textbox', { name: /message/i }),
        'x',
      );

      expect(scrollTop).toBe(120);
    });
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

    it('says what clicking the title does, on hover', async () => {
      // The hover underline signals "clickable" but not "renames". Everything else
      // on this page is inert text, so without a label the affordance is only
      // findable by clicking a heading on the off chance.
      await render();

      // A native title, as DateComponent's: no MUI tooltip and its findDOMNode.
      expect(
        screen.getByRole('button', {
          name: 'Rename session "Which GitHub issues..."',
        }),
      ).toHaveAttribute('title', 'Rename session');
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

  describe('the composer', () => {
    const composer = () => screen.queryByRole('textbox', { name: 'Message' });

    /** The fixture's newest task is `working`; most of these want a settled one. */
    const settledView = {
      ...loadedView,
      isAgentWorking: false,
      state: {
        raw: 'completed',
        key: 'completed',
        label: 'Idle',
        tone: 'success' as const,
        isActive: false,
      },
    };

    it('invites a reply on an idle session, never to "resume" it (T100 H4)', async () => {
      mockUseSessionDetail.mockReturnValue(settledView);
      await render();

      expect(screen.getByText('Idle')).toBeInTheDocument();
      expect(composer()).toHaveAttribute(
        'placeholder',
        expect.stringMatching(/^Reply to .+…$/),
      );
    });

    it('is offered on a session whose agent can be addressed', async () => {
      mockUseSessionDetail.mockReturnValue(settledView);
      await render();

      expect(composer()).toBeInTheDocument();
      expect(composer()).toBeEnabled();
    });

    it('sends what was typed', async () => {
      mockUseSessionDetail.mockReturnValue(settledView);
      await render();

      await userEvent.type(composer()!, 'why is the ingress failing?');
      await userEvent.click(screen.getByRole('button', { name: 'Send' }));

      expect(mockSendMessage).toHaveBeenCalledWith(
        'why is the ingress failing?',
        [],
      );
    });

    it('withholds sending while the agent is mid-turn, but stays editable', async () => {
      // The fixture's newest task is `working`, which is exactly this case. The
      // box is not disabled — that blurred it after every send — only Send is.
      await render();

      expect(composer()).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
      expect(
        screen.getByText(
          /agent is working. You can reply once this turn finishes/,
        ),
      ).toBeInTheDocument();
    });

    it('does not take the focus on a session merely opened', async () => {
      mockUseSessionDetail.mockReturnValue(settledView);
      await render();

      expect(composer()).not.toHaveFocus();
    });

    it('offers Stop in Send’s slot while the agent works on a known turn, and cancels that task', async () => {
      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        isAgentWorking: true,
        currentTaskId: 'task-9',
      });
      await render();

      expect(
        screen.queryByRole('button', { name: 'Send' }),
      ).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole('button', { name: 'Stop the turn' }),
      );

      // Server-side: the task the badge describes, not the stream.
      expect(mockCancelTask).toHaveBeenCalledWith('task-9');
    });

    it('aims Stop at the task the stream named before any poll has seen it', async () => {
      // The first beat of a send: the poll still shows the previous, finished
      // turn, but the stream's task snapshot has already named the new one.
      mockUseSessionDetail.mockReturnValue({
        ...settledView,
        currentTaskId: 'task-old',
      });
      mockUseSendMessage.mockReturnValue(
        idleSend({
          isSending: true,
          stream: {
            ...createStreamTurn('m1'),
            dispatched: true,
            taskId: 'task-new',
          },
        }),
      );
      await render();

      await userEvent.click(
        screen.getByRole('button', { name: 'Stop the turn' }),
      );

      expect(mockCancelTask).toHaveBeenCalledWith('task-new');
    });

    it('withholds Stop while the running turn is not known', async () => {
      // Sending, but neither the stream nor the poll has named the task: Send is
      // withheld as before and nothing pretends to be stoppable.
      mockUseSessionDetail.mockReturnValue(settledView);
      mockUseSendMessage.mockReturnValue(idleSend({ isSending: true }));
      await render();

      expect(
        screen.queryByRole('button', { name: 'Stop' }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    });

    it('is withheld on a read-only session, and says so', async () => {
      // A read-only share rejects every non-GET under /api/sessions with a 403,
      // so the box would only fail on use.
      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        detail: { ...loadedView.detail!, readOnly: true },
      });
      await render();

      expect(composer()).not.toBeInTheDocument();
      expect(
        screen.getByText(/shared read-only, so you cannot add to it/),
      ).toBeInTheDocument();
    });

    it('is withheld when no Agent matched the session, naming the agent', async () => {
      // Without the CR there is no trustworthy namespace/name, and the session's
      // encoded `agent_id` cannot be decoded back into one.
      mockUseAgents.mockReturnValue({
        rows: [],
        isLoading: false,
        isLoadingMore: false,
        hasInstallations: true,
        unreachableInstallations: [],
      } as unknown as AgentsContextValue);
      await render();

      expect(composer()).not.toBeInTheDocument();
      expect(
        screen.getByText(/could not be found on gazelle/),
      ).toBeInTheDocument();
    });

    it('is disabled under the question card while the agent is waiting', async () => {
      // Disabled, not offered alongside: a plain message cannot answer a pending
      // confirmation. kagent would open a new task and leave the question waiting
      // forever, so a live box would quietly strand the conversation.
      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        isAgentWorking: false,
        state: awaitingInput,
        pendingConfirmation: {
          taskId: 'task-1',
          asks: 'input',
          toolName: 'ask_user',
          questions: [{ question: 'Which cluster?', multiple: false }],
        },
      });
      await render();

      // The card in the chat bar prints the question it asks (T40) — the
      // timeline's copy is the record, often scrolled away — and the way to
      // answer it.
      expect(screen.getByText('Which cluster?')).toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: 'Answer' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Send answer' }),
      ).toBeInTheDocument();

      // The composer stays on screen but cannot submit: a plain message would
      // open a new task and strand this one, yet removing the box entirely reads
      // as the reply feature being missing rather than blocked.
      expect(composer()).toBeDisabled();
      // The prototype's waiting caption, naming who waits on what.
      expect(
        screen.getByText('Issue tracker is waiting for your answer above.'),
      ).toBeInTheDocument();
    });

    it('attaches the question card to the docked composer, above the box', async () => {
      // T40: the escalation is answered in the chat bar, like a chat app's
      // agent question — one docked element holding the card and the box,
      // pinned to the view's bottom while the conversation scrolls behind it.
      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        isAgentWorking: false,
        state: awaitingInput,
        pendingConfirmation: {
          taskId: 'task-1',
          asks: 'input',
          toolName: 'ask_user',
          questions: [
            { question: 'Which cluster?', choices: ['a'], multiple: false },
            { question: 'Which namespace?', choices: ['b'], multiple: false },
          ],
        },
      });
      await render();

      const dock = screen.getByTestId('session-dock');
      const card = within(dock).getByRole('form', {
        name: 'Question from the agent',
      });
      const box = within(dock).getByTestId('composer-card');
      expect(
        // eslint-disable-next-line no-bitwise
        card.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // Several questions page in the card.
      expect(within(card).getByText('Question 1 of 2')).toBeInTheDocument();
      // Docked while the question is open too — it used to unpin then.
      expect(getComputedStyle(dock).position).toBe('sticky');
    });

    it('docks the composer and sizes the column to the view', async () => {
      // The layout hook measured the chrome around the column, so a short
      // session's composer sits at the bottom of the view.
      await render();

      const dock = screen.getByTestId('session-dock');
      expect(getComputedStyle(dock).position).toBe('sticky');
      const column = dock.parentElement!;
      expect(column.style.getPropertyValue('--session-column-reserve')).toMatch(
        /^\d+px$/,
      );
      expect(column.style.getPropertyValue('--session-dock-height')).toMatch(
        /^\d+px$/,
      );
    });

    it('rests the docked bar where it sticks, pulled into all of the page’s bottom padding', async () => {
      // Live round 2 (R7): a fixed -16px left 24px of ShellPage's 40px under
      // the bar, so it lifted 24px as the scroll reached the end. ShellPage
      // publishes its padding; 16px where no ShellPage wraps the page.
      await render();

      expect(
        getComputedStyle(screen.getByTestId('session-dock')).marginBottom,
      ).toBe('calc(-1 * var(--shell-page-padding-bottom, 16px))');
    });

    it('says a permission request waits for a decision', async () => {
      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        isAgentWorking: false,
        state: awaitingInput,
        pendingConfirmation: {
          taskId: 'task-1',
          asks: 'approval',
          toolName: 'flux_reconcile',
          args: { name: 'demo' },
          questions: [],
        },
      });
      await render();

      expect(
        screen.getByText('Issue tracker is waiting for your decision above.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Nothing is sent until you allow it.'),
      ).toBeInTheDocument();
    });

    it('offers nothing when the request itself could not be read', async () => {
      // A confirmation whose payload has a shape we do not recognise, or a task
      // with no id to resume. Answering then would be guessing at the question.
      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        isAgentWorking: false,
        state: awaitingInput,
        pendingConfirmation: undefined,
      });
      await render();

      expect(composer()).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Send answer' }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/request could not be read/)).toBeInTheDocument();
    });

    it('submits an answer naming the task it resumes', async () => {
      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        isAgentWorking: false,
        state: awaitingInput,
        pendingConfirmation: {
          taskId: 'task-1',
          asks: 'input',
          toolName: 'ask_user',
          questions: [
            {
              question: 'Which cluster?',
              choices: ['gazelle', 'golem'],
              multiple: false,
            },
          ],
        },
      });
      await render();

      await userEvent.click(screen.getByRole('radio', { name: 'golem' }));
      await userEvent.click(
        screen.getByRole('button', { name: 'Send answer' }),
      );

      expect(mockAnswer).toHaveBeenCalledWith({
        taskId: 'task-1',
        decision: 'approve',
        // Positional and always a list, even for a single choice.
        answers: [['golem']],
        text: 'golem',
      });
    });

    it('ties the answer to the status message that asked', async () => {
      // So a not-taken verdict cannot be pinned on a follow-up question in the
      // same task.
      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        isAgentWorking: false,
        state: awaitingInput,
        pendingConfirmation: {
          taskId: 'task-1',
          asks: 'input',
          toolName: 'ask_user',
          questions: [{ question: 'Which cluster?', multiple: false }],
          askedIn: 'status-1',
        },
      });
      await render();

      await userEvent.type(
        screen.getByRole('textbox', { name: 'Answer' }),
        'golem',
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Send answer' }),
      );

      expect(mockAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1', askedIn: 'status-1' }),
      );
    });

    it('says the agent is working while a turn is in flight', async () => {
      // The fixture's newest task is `working`.
      await render();

      expect(screen.getByText('Working…')).toBeInTheDocument();
    });

    it('says so from the moment of sending, before any poll has seen it', async () => {
      // The A2A state takes up to 10 s to report the new task, and the send's own
      // request is cut off by the gateway before a long turn ends — so neither
      // signal spans the turn alone.
      mockUseSessionDetail.mockReturnValue(settledView);
      mockUseSendMessage.mockReturnValue(idleSend({ isSending: true }));
      await render();

      expect(screen.getByText('Working…')).toBeInTheDocument();
    });

    it('does not claim the agent is working when it is waiting for an answer', async () => {
      // `input-required` is `isActive`, so keying the spinner off that alone would
      // promise progress that never comes without a human.
      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        isAgentWorking: false,
        state: {
          raw: 'input-required',
          key: 'input-required',
          label: 'Waiting for you',
          tone: 'warning',
          isActive: true,
        },
      });
      await render();

      expect(screen.queryByText('Working…')).not.toBeInTheDocument();
    });

    describe('a lost stream', () => {
      // The gateway closed the turn's stream mid-reply (Envoy Gateway's default
      // 15 s route timeout, seen on a customer portal) while the task ran on and
      // finished. The page must neither stay on "Working…" for good nor claim
      // the turn finished before the poll says so. `settledView` is the
      // enclosing describe's: the poll's copy of the previous, finished turn.
      const cutStream = {
        ...createStreamTurn('m1'),
        dispatched: true,
        taskId: 'task-new',
      };

      it('says the result is being checked while the send re-reads the conversation', async () => {
        // The stream is gone and the send is awaiting the conversation; the
        // poll's copy still shows the previous, finished turn.
        mockUseSessionDetail.mockReturnValue(settledView);
        mockUseSendMessage.mockReturnValue(
          idleSend({ isSending: true, isStreamLost: true, stream: cutStream }),
        );
        await render();

        expect(screen.queryByText('Working…')).not.toBeInTheDocument();
        expect(
          screen.getByText('The live stream was lost. Checking the result…'),
        ).toBeInTheDocument();
      });

      it('keeps Stop aimed at the streamed task while the result is checked', async () => {
        mockUseSessionDetail.mockReturnValue(settledView);
        mockUseSendMessage.mockReturnValue(
          idleSend({ isSending: true, isStreamLost: true, stream: cutStream }),
        );
        await render();

        await userEvent.click(
          screen.getByRole('button', { name: 'Stop the turn' }),
        );

        expect(mockCancelTask).toHaveBeenCalledWith('task-new');
      });

      it('says the turn is being followed once the poll shows it still working', async () => {
        // The re-read came back: the task is still running, the preview is
        // gone for good, and the reply arrives through the poll.
        mockUseSessionDetail.mockReturnValue({
          ...loadedView,
          isAgentWorking: true,
          currentTaskId: 'task-9',
        });
        mockUseSendMessage.mockReturnValue(idleSend({ isStreamLost: true }));
        await render();

        expect(screen.queryByText('Working…')).not.toBeInTheDocument();
        expect(
          screen.getByText(/The live stream was lost. Still working/),
        ).toBeInTheDocument();
        // Still a running turn: the composer withholds Send and offers Stop.
        expect(
          screen.queryByRole('button', { name: 'Send' }),
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Stop the turn' }),
        ).toBeInTheDocument();
      });

      it('shows the turn as finished, with the composer free, once the poll says so', async () => {
        // What a reload used to be needed for: the poll reports the task
        // completed with the full answer, and the page follows it.
        mockUseSessionDetail.mockReturnValue(settledView);
        mockUseSendMessage.mockReturnValue(idleSend({ isStreamLost: true }));
        await render();

        expect(screen.queryByText('Working…')).not.toBeInTheDocument();
        expect(
          screen.queryByText(/live stream was lost/),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Idle')).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Send' }),
        ).toBeInTheDocument();
      });

      it('says the same for the stream of an answer', async () => {
        mockUseSessionDetail.mockReturnValue(settledView);
        mockUseAnswerConfirmation.mockReturnValue(
          idleConfirmation({
            isAnswering: true,
            isStreamLost: true,
            stream: cutStream,
          }),
        );
        await render();

        expect(
          screen.getByText('The live stream was lost. Checking the result…'),
        ).toBeInTheDocument();
      });
    });

    describe('a stalled turn', () => {
      // A turn that outlived its transport and never landed: the task stays
      // `submitted` with its timestamp at the send and no later event. kagent
      // still holds it active and refuses a second message, so the page must
      // neither promise progress nor drop to an idle composer the next send
      // would fail from.
      const since = Date.parse('2026-09-13T13:52:00Z');
      const stalledView = {
        ...loadedView,
        isAgentWorking: false,
        turnProgress: { kind: 'stalled' as const, since },
        currentTaskId: 'task-9',
      };
      const clock = new Date(since).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });

      it('says the agent has stopped reporting progress, and since when', async () => {
        mockUseSessionDetail.mockReturnValue(stalledView);
        await render();

        expect(screen.queryByText('Working…')).not.toBeInTheDocument();
        expect(
          screen.getByText(
            `The agent has not reported progress since ${clock}.`,
          ),
        ).toBeInTheDocument();
      });

      it('names the stall in the state too, not Working (R2-4)', async () => {
        // The poll still reads the stalled task as working; the header must
        // not say so beside a row that says it stopped reporting progress.
        mockUseSessionDetail.mockReturnValue(stalledView);
        await render();

        expect(screen.getByText('Not responding')).toBeInTheDocument();
        expect(screen.queryByText('Working')).not.toBeInTheDocument();
      });

      it('names the stall over an open but silent stream as well', async () => {
        mockUseSessionDetail.mockReturnValue(stalledView);
        mockUseSendMessage.mockReturnValue(idleSend({ isSending: true }));
        await render();

        expect(screen.getByText('Not responding')).toBeInTheDocument();
        expect(screen.queryByText('Working')).not.toBeInTheDocument();
      });

      it('keeps Send withheld — the session is still busy — and says why', async () => {
        mockUseSessionDetail.mockReturnValue(stalledView);
        await render();

        expect(composer()).toBeEnabled();
        expect(
          screen.queryByRole('button', { name: 'Send' }),
        ).not.toBeInTheDocument();
        expect(
          screen.getByText(/stopped reporting progress. Stop the turn/),
        ).toBeInTheDocument();
      });

      it('overrides an open but silent stream', async () => {
        // A send whose stream is still open yet has delivered nothing for the
        // whole bound is the same symptom the poll measured; "Working…" beside
        // "no progress since" would contradict itself.
        mockUseSessionDetail.mockReturnValue(stalledView);
        mockUseSendMessage.mockReturnValue(idleSend({ isSending: true }));
        await render();

        expect(screen.queryByText('Working…')).not.toBeInTheDocument();
        expect(
          screen.getByText(/has not reported progress/),
        ).toBeInTheDocument();
      });

      it('cancels the turn from the row, and puts the unanswered message back into the box', async () => {
        mockUseSessionDetail.mockReturnValue(stalledView);
        await render();

        await userEvent.click(
          // The labelled button, not the composer's icon of the same name.
          screen.getByText('Stop the turn', { selector: 'button, button *' }),
        );

        expect(mockCancelTask).toHaveBeenCalledWith('task-9');
        // The message the stalled turn never answered: "send again" should not
        // mean typing it twice.
        const lastUserMessage = [...timeline.items]
          .reverse()
          .find(item => item.kind === 'user-message');
        expect(lastUserMessage).toBeDefined();
        await waitFor(() =>
          expect(composer()).toHaveValue(
            (lastUserMessage as { text: string }).text,
          ),
        );
      });

      it('puts the unanswered message’s images back with its text', async () => {
        mockUseSessionDetail.mockReturnValue(
          withImageOnLastMessage(stalledView),
        );
        await render();

        await userEvent.click(
          screen.getByText('Stop the turn', { selector: 'button, button *' }),
        );

        expect(
          await screen.findByRole('button', { name: 'Remove shot.png' }),
        ).toBeInTheDocument();
      });

      it('does not offer the cancel when the task is not known', async () => {
        mockUseSessionDetail.mockReturnValue({
          ...stalledView,
          currentTaskId: undefined,
        });
        await render();

        expect(
          screen.queryByRole('button', { name: 'Stop the turn' }),
        ).not.toBeInTheDocument();
        expect(
          screen.getByText(/has not reported progress/),
        ).toBeInTheDocument();
      });
    });

    describe('Stop for a task that stopped moving (#2364)', () => {
      // The observed failure on the first 4.x installation: a turn's model
      // stream was cut by a gateway pod eviction, the task stayed `working` on
      // the server for ten minutes, the header said Working — and after a
      // reload the composer offered Send only, its caption promising that a
      // reply would be added, because Stop needed `isAgentWorking`, which the
      // age bound had turned off. The task that stopped moving is exactly the
      // one that needs Stop.
      const since = Date.parse('2026-09-13T13:53:00Z');
      const workingView = {
        ...loadedView,
        isAgentWorking: true,
        turnProgress: { kind: 'working' as const },
        currentTaskId: 'task-stuck',
      };
      const staleView = {
        ...loadedView,
        isAgentWorking: false,
        turnProgress: { kind: 'stalled' as const, since },
        currentTaskId: 'task-stuck',
      };

      it('offers Stop after a reload, past the age bound, and cancels that task', async () => {
        // A fresh page over a stale task: no stream, no send in flight, only
        // the poll's verdict that the newest task is active and has not moved.
        mockUseSessionDetail.mockReturnValue(staleView);
        await render();

        expect(
          screen.queryByRole('button', { name: 'Send' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/reply is added/)).not.toBeInTheDocument();
        expect(
          screen.getByText(/stopped reporting progress. Stop the turn/),
        ).toBeInTheDocument();

        // The composer's and the stalled row's: one action, one name.
        await userEvent.click(
          screen.getAllByRole('button', { name: 'Stop the turn' })[0],
        );

        expect(mockCancelTask).toHaveBeenCalledWith('task-stuck');
      });

      it('keeps Stop when the working turn goes stale under the open page', async () => {
        // The same page instance, not a remount: the poll's judgement flips
        // from working to stalled while the person watches. Stop must survive
        // the flip — it used to vanish at exactly this moment.
        mockUseSessionDetail.mockReturnValue(workingView);
        function Harness() {
          const [, setTick] = useState(0);
          return (
            <>
              <button
                type="button"
                onClick={() => {
                  mockUseSessionDetail.mockReturnValue(staleView);
                  setTick(tick => tick + 1);
                }}
              >
                age the task
              </button>
              <SessionDetailPage />
            </>
          );
        }
        await renderInTestApp(<Harness />, {
          mountedRoutes: { '/sessions': sessionsRouteRef },
        });

        expect(
          screen.getByRole('button', { name: 'Stop the turn' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Working…')).toBeInTheDocument();

        await userEvent.click(
          screen.getByRole('button', { name: 'age the task' }),
        );

        expect(screen.queryByText('Working…')).not.toBeInTheDocument();
        expect(
          screen.getByText(/has not reported progress/),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: 'Send' }),
        ).not.toBeInTheDocument();
        // The composer's and the stalled row's: one action, one name.
        await userEvent.click(
          screen.getAllByRole('button', { name: 'Stop the turn' })[0],
        );

        expect(mockCancelTask).toHaveBeenCalledWith('task-stuck');
      });

      it('reports a failed Stop as "Could not stop the turn" with the backend’s message', async () => {
        mockUseSessionDetail.mockReturnValue(workingView);
        mockUseCancelTask.mockReturnValue(
          idleCancel({ error: new Error('kagent is unavailable') }),
        );
        await render();

        expect(screen.getByText('Could not stop the turn')).toBeInTheDocument();
        expect(screen.getByText('kagent is unavailable')).toBeInTheDocument();
        expect(screen.queryByText('Message not sent')).not.toBeInTheDocument();
        // Nothing was sent, so nothing is put back into the box.
        expect(composer()).toHaveValue('');
      });

      it('tells a Stop refused with a 401 to reload the page', async () => {
        // The Backstage pod rolled while the tab stayed open and the tab's
        // token no longer verifies; a reload signs it back in silently.
        const unauthorized = new Error('Failed user token verification');
        unauthorized.name = 'UnauthorizedError';
        mockUseSessionDetail.mockReturnValue(staleView);
        mockUseCancelTask.mockReturnValue(idleCancel({ error: unauthorized }));
        await render();

        expect(screen.getByText('Could not stop the turn')).toBeInTheDocument();
        expect(
          screen.getByText(
            /Failed user token verification\. Your sign-in expired — reload the page and stop the turn again\./,
          ),
        ).toBeInTheDocument();
        expect(screen.queryByText('Message not sent')).not.toBeInTheDocument();
      });
    });

    describe('a send refused because the previous turn is still running', () => {
      const conflict = new Error(
        "The agent on installation 'gazelle' is still working on the previous message",
      );
      conflict.name = 'ConflictError';

      it('explains the 409 and offers to cancel that turn', async () => {
        mockUseSessionDetail.mockReturnValue({
          ...loadedView,
          currentTaskId: 'task-9',
        });
        mockUseSendMessage.mockReturnValue(
          idleSend({
            error: conflict,
            failed: { messageId: 'm-refused', text: 'the refused message' },
          }),
        );
        await render();

        expect(
          screen.getByText(
            'This session is still working on the previous turn',
          ),
        ).toBeInTheDocument();
        // Not doubled by the composer's generic failure notice.
        expect(screen.queryByText('Message not sent')).not.toBeInTheDocument();
        // The refused text is back in the box, as after any failed send.
        expect(composer()).toHaveValue('the refused message');

        await userEvent.click(
          // The labelled button, not the composer's icon of the same name.
          screen.getByText('Stop the turn', { selector: 'button, button *' }),
        );
        expect(mockCancelTask).toHaveBeenCalledWith('task-9');
      });

      it('still reports any other failure as a failed send', async () => {
        mockUseSendMessage.mockReturnValue(
          idleSend({ error: new Error('kagent is unavailable') }),
        );
        await render();

        expect(screen.getByText('Message not sent')).toBeInTheDocument();
        expect(
          screen.queryByText(/still working on the previous turn/),
        ).not.toBeInTheDocument();
      });
    });

    describe('an answer that streams the resumed turn', () => {
      const awaiting = {
        ...loadedView,
        isAgentWorking: false,
        state: awaitingInput,
        currentTaskId: 'task-1',
        pendingConfirmation: {
          taskId: 'task-1',
          asks: 'input' as const,
          toolName: 'ask_user',
          questions: [{ question: 'Which cluster?', multiple: false }],
        },
      };

      it('shows the panel as sending until kagent takes the answer', async () => {
        mockUseSessionDetail.mockReturnValue(awaiting);
        mockUseAnswerConfirmation.mockReturnValue(
          idleConfirmation({
            isAnswering: true,
            stream: createStreamTurn('a1'),
          }),
        );
        await render();

        expect(
          screen.getByRole('button', { name: 'Sending…' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Working…')).not.toBeInTheDocument();
      });

      it('replaces the panel with the working composer once the stream has its first event', async () => {
        // The poll still says `input-required` for up to 10 s; the stream
        // already knows the task is running again.
        mockUseSessionDetail.mockReturnValue(awaiting);
        mockUseAnswerConfirmation.mockReturnValue(
          idleConfirmation({
            isAnswering: true,
            stream: {
              ...createStreamTurn('a1'),
              dispatched: true,
              taskId: 'task-1',
            },
          }),
        );
        await render();

        expect(
          screen.queryByRole('button', { name: 'Send answer' }),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Working…')).toBeInTheDocument();
        expect(composer()).toBeEnabled();

        // Stop aims at the task the answer resumed.
        await userEvent.click(
          screen.getByRole('button', { name: 'Stop the turn' }),
        );
        expect(mockCancelTask).toHaveBeenCalledWith('task-1');
      });

      it('renders the resumed turn’s streamed reply like a sent message’s', async () => {
        mockUseSessionDetail.mockReturnValue(awaiting);
        mockUseAnswerConfirmation.mockReturnValue(
          idleConfirmation({
            isAnswering: true,
            stream: {
              ...createStreamTurn('a1'),
              dispatched: true,
              taskId: 'task-1',
              items: [
                {
                  kind: 'agent-message',
                  id: 'stream:0',
                  taskIndex: 0,
                  text: 'Done, after your decision.',
                },
              ],
            },
          }),
        );
        await render();

        expect(
          screen.getByText('Done, after your decision.'),
        ).toBeInTheDocument();
      });
    });

    it('stops saying so once the turn is finished', async () => {
      mockUseSessionDetail.mockReturnValue(settledView);
      await render();

      expect(screen.queryByText('Working…')).not.toBeInTheDocument();
    });

    it('shows a message that has been sent but not yet read back', async () => {
      mockUseSendMessage.mockReturnValue(
        idleSend({
          isSending: true,
          pending: { messageId: 'pending-1', text: 'a message in flight' },
        }),
      );
      await render();

      expect(screen.getByText('a message in flight')).toBeInTheDocument();
    });

    it('shows the images of the message in flight with it', async () => {
      mockUseSessionDetail.mockReturnValue(settledView);
      mockUseSendMessage.mockReturnValue(
        idleSend({
          isSending: true,
          pending: {
            messageId: 'pending-1',
            text: 'what is wrong here?',
            images: [PENDING_IMAGE],
          },
        }),
      );
      await render();

      expect(screen.getByRole('img', { name: 'shot.png' })).toHaveAttribute(
        'src',
        PENDING_IMAGE.previewUrl,
      );
    });

    it('stops showing the pending copy once kagent returns the real one', async () => {
      // Recognised by `messageId`, not by timing — a poll can deliver the stored
      // message long before the turn ends, and showing both would double it for
      // the rest of the turn.
      const realMessageId = timeline.items.find(
        item => item.messageId,
      )?.messageId;
      expect(realMessageId).toBeTruthy();

      mockUseSendMessage.mockReturnValue(
        idleSend({
          isSending: true,
          pending: { messageId: realMessageId!, text: 'a duplicate stand-in' },
        }),
      );
      await render();

      expect(
        screen.queryByText('a duplicate stand-in'),
      ).not.toBeInTheDocument();
    });

    describe('a streamed reply the poll has read back', () => {
      const replyTimeline = (text: string) => ({
        ...timeline,
        items: [
          {
            kind: 'user-message' as const,
            id: 'm-sent',
            taskIndex: 0,
            messageId: 'm-sent',
            text: 'how are the nodes?',
          },
          {
            kind: 'agent-message' as const,
            id: 'art-reply',
            taskIndex: 0,
            messageId: 'art-reply',
            text,
          },
        ],
      });
      const replyStream = {
        ...createStreamTurn('m-sent'),
        dispatched: true,
        items: [
          {
            kind: 'agent-message' as const,
            id: 'stream:0',
            taskIndex: 0,
            messageId: 'art-reply',
            text: 'All nodes are ready.',
          },
        ],
      };

      it('is shown once', async () => {
        mockUseSessionDetail.mockReturnValue({
          ...loadedView,
          timeline: replyTimeline('All nodes are ready.'),
        });
        mockUseSendMessage.mockReturnValue(
          idleSend({ isSending: true, stream: replyStream }),
        );
        await render();

        expect(screen.getAllByText('All nodes are ready.')).toHaveLength(1);
      });

      it('shows what the stream has beyond a read that cut it off', async () => {
        // kagent appends to an artifact as it streams, so a poll mid-reply holds
        // the start of it under the same id.
        mockUseSessionDetail.mockReturnValue({
          ...loadedView,
          timeline: replyTimeline('All nodes'),
        });
        mockUseSendMessage.mockReturnValue(
          idleSend({ isSending: true, stream: replyStream }),
        );
        await render();

        expect(screen.getAllByText('All nodes are ready.')).toHaveLength(1);
        expect(screen.queryByText('All nodes')).not.toBeInTheDocument();
      });

      it('advances it from the text still being written', async () => {
        mockUseSessionDetail.mockReturnValue({
          ...loadedView,
          timeline: replyTimeline('All nodes'),
        });
        mockUseSendMessage.mockReturnValue(
          idleSend({
            isSending: true,
            stream: {
              ...replyStream,
              items: [],
              live: {
                kind: 'agent-message' as const,
                text: 'All nodes are rea',
                messageId: 'art-reply',
              },
            },
          }),
        );
        await render();

        expect(screen.getAllByText('All nodes are rea')).toHaveLength(1);
        expect(screen.queryByText('All nodes')).not.toBeInTheDocument();
      });

      it('keeps each paragraph in its place when text follows a call', async () => {
        // Both paragraphs and the call between them are one message. The poll
        // read only the first; the second must neither take its place nor wait
        // for the next read.
        mockUseSessionDetail.mockReturnValue({
          ...loadedView,
          timeline: replyTimeline('Checking the nodes.'),
        });
        mockUseSendMessage.mockReturnValue(
          idleSend({
            isSending: true,
            stream: {
              ...replyStream,
              items: [
                { ...replyStream.items[0], text: 'Checking the nodes.' },
                {
                  kind: 'tool-call' as const,
                  id: 'stream:1',
                  taskIndex: 0,
                  messageId: 'art-reply',
                  toolName: 'kubectl_get',
                  isPending: true,
                },
                { ...replyStream.items[0], id: 'stream:2' },
              ],
            },
          }),
        );
        await render();

        const first = screen.getByText('Checking the nodes.');
        const second = screen.getByText('All nodes are ready.');
        expect(
          first.compareDocumentPosition(second) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      });
    });

    describe('a streamed turn ending', () => {
      /** The stream's copy of a cancel: terminal, and with no reason to carry. */
      const canceledStream = () => ({
        ...createStreamTurn('m-canceled-1'),
        dispatched: true,
        isFinal: true,
        stateKey: 'canceled',
        items: [
          {
            kind: 'turn-failed' as const,
            id: 'stream:0',
            taskIndex: 0,
            state: 'canceled',
          },
        ],
      });

      const canceledTimeline = buildTimeline(
        normalizeTaskList({
          data: [
            {
              id: 'task-canceled',
              status: {
                state: 'canceled',
                timestamp: '2026-09-18T05:56:07.729Z',
              },
              history: [
                {
                  messageId: 'm-canceled-1',
                  role: 'user',
                  parts: [{ text: 'Could a node pool sit in another region?' }],
                },
              ],
            },
          ],
        }).tasks,
      );

      it('is dropped once the poll has closed that turn', async () => {
        // How a turn ended carries a `messageId` only when kagent wrote a reason,
        // and a cancel has none to write — so neither copy can be recognised by
        // id, and both rendered until the send discarded its preview. A turn has
        // one ending, so the poll having closed this turn retires the streamed one.
        mockUseSessionDetail.mockReturnValue({
          ...loadedView,
          timeline: canceledTimeline,
        });
        mockUseSendMessage.mockReturnValue(
          idleSend({ isSending: true, stream: canceledStream() }),
        );
        await render();

        expect(screen.getAllByText('This turn was canceled')).toHaveLength(1);
      });

      it('is still shown while the poll has not caught up', async () => {
        // The other half: the preview is the only record of how the turn ended
        // until the conversation read lands, and dropping it there would put the
        // page back to a reply that stops mid-sentence with nothing to say why.
        mockUseSendMessage.mockReturnValue(
          idleSend({ isSending: true, stream: canceledStream() }),
        );
        await render();

        expect(screen.getByText('This turn was canceled')).toBeInTheDocument();
      });
    });
  });

  describe('the first message of a session just created', () => {
    const handoff = {
      text: 'why is the ingress failing?',
      agentNamespace: 'kagent',
      agentName: 'issue-tracker',
    };

    it('sends the images that came with it', async () => {
      mockUseNewSessionHandoff.mockReturnValue({
        ...handoff,
        images: [PENDING_IMAGE],
      });
      await render();

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          'why is the ingress failing?',
          [PENDING_IMAGE],
        );
      });
    });

    it('sends it on arrival, so the user watches the reply appear', async () => {
      // Created on the previous screen, sent here: `message/send` blocks for the
      // whole turn, so awaiting it before navigating would have meant staring at
      // the sessions list for up to half a minute.
      mockUseNewSessionHandoff.mockReturnValue(handoff);
      await render();

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          'why is the ingress failing?',
          undefined,
        );
      });
    });

    it('sends it exactly once, however often the page re-renders', async () => {
      // This page polls, so it re-renders constantly. A second dispatch would be
      // a second paid turn with the same prompt.
      mockUseNewSessionHandoff.mockReturnValue(handoff);
      await render();

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledTimes(1);
      });

      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        taskCount: loadedView.taskCount + 1,
      });

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledTimes(1);
      });
    });

    it('sends nothing when the session was merely opened', async () => {
      await render();

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('lands with the cursor in the message box', async () => {
      // The user was typing in the composer that created the session a moment
      // ago; the navigation took the focus with it. Reported by the first colleague
      // to try the chat: every new session started with a click into the box.
      mockUseNewSessionHandoff.mockReturnValue(handoff);
      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        isAgentWorking: false,
      });
      await render();

      expect(screen.getByRole('textbox', { name: 'Message' })).toHaveFocus();
    });

    it('dispatches even before the session read has resolved its agent', async () => {
      // The agent travels with the prompt precisely so the send does not have to
      // wait for the session read and its join against the fleet-wide Agent list.
      mockUseNewSessionHandoff.mockReturnValue(handoff);
      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        detail: undefined,
        timeline: emptyTimeline,
        state: undefined,
        taskCount: 0,
        hasConversation: false,
        isLoading: true,
      });
      await render();

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          'why is the ingress failing?',
          undefined,
        );
      });
    });

    it('keeps the prompt recoverable when the send fails', async () => {
      // The composer's `restore` is the only place the text still exists — the
      // same path a failed reply takes.
      mockUseNewSessionHandoff.mockReturnValue(handoff);
      mockUseSendMessage.mockReturnValue(
        idleSend({
          error: new Error('the agent could not be reached'),
          failed: { messageId: 'msg-1', text: 'why is the ingress failing?' },
        }),
      );
      await render();

      expect(screen.getByText('Message not sent')).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(
        'why is the ingress failing?',
      );
    });

    it('captions the first message as the portal’s when a hand-off prepared it', async () => {
      // A meta-agent hand-off wrote it, not the person (UX review M20).
      mockUseNewSessionHandoff.mockReturnValue({ ...handoff, prepared: true });
      await render();

      const captions = screen.getAllByTestId('timeline-user-message-caption');
      expect(captions).toHaveLength(1);
      expect(captions[0]).toHaveTextContent('Prepared by the portal');
      expect(
        screen.getAllByTestId('timeline-user-message')[0],
      ).toContainElement(captions[0]);
    });

    it('captions nothing the person typed themselves', async () => {
      mockUseNewSessionHandoff.mockReturnValue(handoff);
      await render();

      expect(
        screen.queryByTestId('timeline-user-message-caption'),
      ).not.toBeInTheDocument();
    });
  });

  describe('a session whose runtime kagent cannot bring back (#2388)', () => {
    const ATENET =
      'actor "ai-01a09e86-0da0-764b-87b1-ac52875d1e74" request timed out';
    const failedState = {
      raw: 'failed',
      key: 'failed',
      label: 'Failed',
      tone: 'danger' as const,
      isActive: false,
    };
    /** The interim shape: the newest turn failed with the runtime's words. */
    const suspectedView: SessionDetailView = {
      ...loadedView,
      isAgentWorking: false,
      state: failedState,
      runtimeLoss: { reported: false, cause: ATENET, attempts: 1 },
    };
    /** kagent has marked the instance. */
    const reportedView: SessionDetailView = {
      ...suspectedView,
      runtimeLoss: {
        reported: true,
        cause: 'local snapshot on node ip-10-0-159-226 is gone',
        attempts: 1,
      },
    };
    const composer = () => screen.getByRole('textbox', { name: 'Message' });
    const startButton = () =>
      screen.getByRole('button', {
        name: 'Continue in a new session',
      });
    /** The message that never got its answer — the last one the person sent. */
    const lastUserMessage = [...timeline.items]
      .reverse()
      .find(item => item.kind === 'user-message')!.text;
    const handoffTo = (text: string) => ({
      state: {
        newSession: {
          text,
          agentNamespace: 'kagent',
          agentName: 'issue-tracker',
        },
      },
    });
    /** What the new session was created with. */
    const created = async () => {
      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled();
      });
      return mockCreateSession.mock.calls[0][0] as {
        prompt: string;
        title?: string;
      };
    };

    it('explains the failed turn in the portal’s words and offers the new session under the box', async () => {
      mockUseSessionDetail.mockReturnValue(suspectedView);
      await render();

      expect(
        screen.getByText('The agent’s runtime could not be brought back'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/The transcript above is complete/),
      ).toBeInTheDocument();
      // The runtime's words are the evidence under the explanation — and
      // nowhere the whole text of anything.
      expect(screen.getByText(/kagent reported:/)).toHaveTextContent(ATENET);
      expect(screen.queryByText(ATENET)).not.toBeInTheDocument();
      // Suspected, not reported: the retry stays, and no mark yet.
      expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
      expect(startButton()).toBeEnabled();
      expect(screen.queryByText('Runtime lost')).not.toBeInTheDocument();
    });

    it('reads the loss off the send’s own error too, and keeps the text', async () => {
      // A failure kagent reported in-band before any event carries the same
      // words; it is the runtime's failure, not a message that was not sent.
      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        isAgentWorking: false,
        state: { ...failedState, key: 'completed', raw: 'completed' },
      });
      mockUseSendMessage.mockReturnValue(
        idleSend({
          error: new Error(
            `The agent on installation 'gazelle' did not accept the message: ${ATENET}`,
          ),
          failed: { messageId: 'm-1', text: 'Six of them are vegetarian.' },
        }),
      );
      await render();

      expect(
        screen.getByText('The agent’s runtime could not be brought back'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Message not sent')).not.toBeInTheDocument();
      expect(composer()).toHaveValue('Six of them are vegetarian.');
    });

    it('opens the new session on the unanswered message with its images, from an empty box', async () => {
      mockUseSessionDetail.mockReturnValue(
        withImageOnLastMessage(suspectedView),
      );
      await render();

      await userEvent.click(startButton());

      const { prompt } = await created();
      // The message is in the conversation the new session carries; its
      // images go along with the first message.
      expect(prompt).toContain(`User: ${lastUserMessage.trim()}`);
      expect(prompt).toContain('[User attached a file: shot.png]');
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/sessions/gazelle/new-1', {
          state: {
            newSession: expect.objectContaining({
              text: prompt,
              imagesKey: expect.any(String),
            }),
          },
        });
      });
    });

    it('starts a new session on the whole conversation, not on the box’s text', async () => {
      // Create, navigate, then send — the order every entry point keeps; the
      // new page dispatches the text it finds in the router state.
      mockUseSessionDetail.mockReturnValue(suspectedView);
      await render();

      expect(
        screen.getByText(
          /Send again to retry\. If it fails again, continue in a new session with Issue tracker\. Its first message holds this conversation \(\d+ messages?\), with tools named but not their results\./,
        ),
      ).toBeInTheDocument();

      // The box is for the retry; the new session does not take its text.
      await userEvent.type(composer(), 'Six of them are vegetarian.');
      await userEvent.click(startButton());

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalledWith({
          agent: expect.objectContaining({
            installation: 'gazelle',
            namespace: 'kagent',
            technicalName: 'issue-tracker',
          }),
          prompt: expect.any(String),
          title: expect.stringMatching(/^Continued: /),
        });
      });
      const { prompt } = await created();
      // Its first line names this session, for the new page's banner.
      expect(prompt).toMatch(
        /^\[Continues session gazelle\/abc\]\n\nI am continuing a session with you that could not be resumed/,
      );
      const firstUserMessage = timeline.items.find(
        item => item.kind === 'user-message',
      )!.text;
      expect(prompt).toContain(`User: ${firstUserMessage.trim()}`);
      expect(prompt).toContain(`User: ${lastUserMessage.trim()}`);
      expect(prompt).not.toContain('Six of them are vegetarian.');
      expect(prompt).not.toContain('## Your last question');
      expect(prompt).not.toContain('## My');
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          '/sessions/gazelle/new-1',
          handoffTo(prompt),
        );
      });
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('withholds the new session, and says why, where muster has no per-user sign-in', async () => {
      const blocker =
        "Muster on gazelle has no per-user sign-in in this portal, so agent-manager would act under muster's shared identity instead of as you.";
      const context = mockUseAgents();
      mockUseAgents.mockReturnValue({
        ...context,
        rows: context.rows.map(row => ({
          ...row,
          sessionBlocker: blocker,
        })),
      } as AgentsContextValue);
      mockUseSessionDetail.mockReturnValue(reportedView);
      await render();

      expect(
        screen.queryByRole('button', {
          name: 'Continue in a new session',
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          /A new session with Issue tracker cannot be started from this portal: sessions start through agent-manager as you\. Muster on gazelle has no per-user sign-in/,
        ),
      ).toBeInTheDocument();
    });

    it('carries a failed send the transcript does not hold, as the newest message', async () => {
      // kagent refused it before it recorded the turn: only the box has it.
      mockUseSessionDetail.mockReturnValue(suspectedView);
      mockUseSendMessage.mockReturnValue(
        idleSend({
          error: new Error(ATENET),
          failed: {
            messageId: 'm-1',
            text: 'the message that failed',
            images: [PENDING_IMAGE],
          },
        }),
      );
      await render();

      await userEvent.click(startButton());

      const { prompt } = await created();
      expect(prompt).toMatch(
        /User: the message that failed\n\n\[User attached a file: shot\.png\]$/,
      );
      expect(
        (mockStashHandoffImages.mock.calls[0][0] as { name: string }[]).map(
          image => image.name,
        ),
      ).toEqual(['shot.png']);
    });

    describe('the message that never got its answer', () => {
      const message = 'Six of them are vegetarian.';
      const items = (...after: TimelineItem[]): TimelineItem[] => [
        {
          id: 'u1',
          kind: 'user-message',
          taskIndex: 0,
          messageId: 'm-1',
          text: 'Plan a barbecue for twelve.',
        },
        { id: 'a1', kind: 'agent-message', taskIndex: 0, text: 'Sure.' },
        {
          id: 'u2',
          kind: 'user-message',
          taskIndex: 1,
          messageId: 'm-2',
          text: message,
        },
        {
          id: 'img',
          kind: 'attachment',
          taskIndex: 1,
          messageId: 'm-2',
          isUser: true,
          name: 'shot.png',
          preview: {
            kind: 'image',
            type: 'image/png',
            dataUrl: PENDING_IMAGE.previewUrl,
            byteSize: PENDING_IMAGE.byteSize,
          },
        },
        ...after,
      ];
      const failedTurn: TimelineItem = {
        id: 'f',
        kind: 'turn-failed',
        taskIndex: 1,
        state: 'failed',
        reason: ATENET,
      };
      const lostWith = (timelineItems: TimelineItem[]): SessionDetailView => ({
        ...reportedView,
        timeline: { ...loadedView.timeline, items: timelineItems },
      });
      const handedImages = () =>
        mockStashHandoffImages.mock.calls[0][0] as { name: string }[];

      it('is carried once, with its images, when the failed send handed it back too', async () => {
        // The gateway recorded the turn before the send failed: the
        // transcript has the message, and the send handed back the same one.
        mockUseSessionDetail.mockReturnValue(lostWith(items(failedTurn)));
        mockUseSendMessage.mockReturnValue(
          idleSend({
            error: new Error(ATENET),
            failed: {
              messageId: 'm-2',
              text: message,
              images: [PENDING_IMAGE],
            },
          }),
        );
        await render();

        await userEvent.click(startButton());

        const { prompt } = await created();
        expect(prompt.split(message)).toHaveLength(2);
        expect(prompt).toContain('[User attached a file: shot.png]');
        expect(handedImages().map(image => image.name)).toEqual(['shot.png']);
      });

      it('is not one once the agent answered it', async () => {
        mockUseSessionDetail.mockReturnValue(
          lostWith(
            items({
              id: 'a2',
              kind: 'agent-message',
              taskIndex: 1,
              text: 'Two grills, then.',
            }),
          ),
        );
        await render();

        await userEvent.click(startButton());

        await created();
        expect(handedImages()).toEqual([]);
      });
    });

    it('shows no message box once kagent reports the loss, and offers the new session in the notice', async () => {
      mockUseSessionDetail.mockReturnValue(reportedView);
      await render();

      expect(screen.getByText('Runtime lost')).toBeInTheDocument();
      const notice = screen
        .getByText('This session cannot continue')
        .closest('.bui-Alert') as HTMLElement;
      expect(
        within(notice).getByText(
          /To carry on, continue in a new session with Issue tracker\. Its first message holds this conversation \(\d+ messages?\), with tools named but not their results\./,
        ),
      ).toBeInTheDocument();
      // The session takes no more messages: no box, no Send.
      expect(
        screen.queryByRole('textbox', { name: 'Message' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Send' }),
      ).not.toBeInTheDocument();
      // The way on is inside the notice, where the eye already is.
      expect(
        within(notice).getByRole('button', {
          name: 'Continue in a new session',
        }),
      ).toBeInTheDocument();

      await userEvent.click(startButton());

      const { prompt, title } = await created();
      expect(prompt).toMatch(/^\[Continues session gazelle\/abc\]/);
      expect(prompt).toContain(`User: ${lastUserMessage.trim()}`);
      expect(title).toMatch(/^Continued: /);
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('lets the way out take the answer panel’s place, and carries the open question', async () => {
      // An answer would run into the same lost runtime; the question stays in
      // the transcript and the notice offers the new session instead.
      mockUseSessionDetail.mockReturnValue({
        ...reportedView,
        state: awaitingInput,
        pendingConfirmation: {
          taskId: 'task-2',
          asks: 'input',
          questions: [
            { question: 'How many are vegetarian?', multiple: false },
          ],
        },
      });
      await render();

      expect(
        screen.queryByText('How many are vegetarian?'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('textbox', { name: 'Message' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          /with tools named but not their results, and the open question\./,
        ),
      ).toBeInTheDocument();

      await userEvent.click(startButton());

      const { prompt } = await created();
      expect(prompt).toMatch(
        /## Your last question\n\n1\. How many are vegetarian\?$/,
      );
      expect(prompt).not.toContain('## My answer');
    });

    it('leaves the answer to the question card while the card is up', async () => {
      // Suspected: the card stays with its retry and holds the answer itself.
      mockUseSessionDetail.mockReturnValue({
        ...suspectedView,
        state: awaitingInput,
        pendingConfirmation: {
          taskId: 'task-2',
          asks: 'input',
          questions: [
            { question: 'How many are vegetarian?', multiple: false },
          ],
          askedIn: 'status-1',
        },
      });
      mockUseAnswerConfirmation.mockReturnValue(
        idleConfirmation({
          error: new Error(ATENET),
          failed: {
            messageId: 'answer-1',
            taskId: 'task-2',
            decision: 'approve',
            answers: [['Six']],
            text: 'Six',
            askedIn: 'status-1',
          },
        }),
      );
      await render();

      expect(
        screen.getByText('The agent’s runtime could not be brought back'),
      ).toBeInTheDocument();
      expect(screen.getByText('How many are vegetarian?')).toBeInTheDocument();
      expect(screen.queryByText('Your answer: Six')).not.toBeInTheDocument();
    });

    it('carries the answer the lost runtime never took, and shows it', async () => {
      // The person answered; the resume found the runtime gone, and kagent
      // has since marked the loss. The answer is the person's, and the new
      // session gets it.
      mockUseSessionDetail.mockReturnValue({
        ...reportedView,
        state: awaitingInput,
        pendingConfirmation: {
          taskId: 'task-2',
          asks: 'input',
          questions: [
            { question: 'How many are vegetarian?', multiple: false },
          ],
          askedIn: 'status-1',
        },
      });
      mockUseAnswerConfirmation.mockReturnValue(
        idleConfirmation({
          error: new Error(ATENET),
          failed: {
            messageId: 'answer-1',
            taskId: 'task-2',
            decision: 'approve',
            answers: [['Six']],
            text: 'Six',
            askedIn: 'status-1',
          },
        }),
      );
      await render();

      expect(screen.getByText('Your answer: Six')).toBeInTheDocument();
      expect(
        screen.getByText(
          /with tools named but not their results, the open question and your answer\./,
        ),
      ).toBeInTheDocument();

      await userEvent.click(startButton());

      const { prompt } = await created();
      expect(prompt).toContain(
        '## Your last question\n\n1. How many are vegetarian?',
      );
      expect(prompt).toMatch(/## My answer\n\n1\. Six$/);
      expect(mockAnswer).not.toHaveBeenCalled();
    });

    it('reports a failed start in the notice', async () => {
      mockUseSessionDetail.mockReturnValue(suspectedView);
      mockUseCreateSession.mockReturnValue(
        idleCreation({ error: new Error('kagent does not know the agent') }),
      );
      await render();

      expect(
        screen.getByText(
          /The new session could not be started: kagent does not know the agent/,
        ),
      ).toBeInTheDocument();
    });

    it('hands the loss to the actions menu, so a failed delete is worded', async () => {
      mockUseSessionDetail.mockReturnValue(suspectedView);
      await render();

      expect(lastProvidedActions().props.runtimeLoss).toEqual(
        suspectedView.runtimeLoss,
      );
    });

    it('says nothing of the sort on a healthy session', async () => {
      await render();

      expect(
        screen.queryByText(/runtime could not be brought back/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Continue in a new session/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe('a session that continues another', () => {
    const continuationView = (text: string): SessionDetailView => ({
      ...loadedView,
      timeline: {
        ...loadedView.timeline,
        items: [
          { id: 'u1', kind: 'user-message', taskIndex: 0, text },
          ...loadedView.timeline.items.filter(
            item => item.kind !== 'user-message',
          ),
        ],
      },
    });

    it('shows the marker as a banner linking to the original session, not as text', async () => {
      mockUseSessionDetail.mockReturnValue(
        continuationView(
          '[Continues session other-lab/0a1b2c]\n\nI am continuing a session with you.',
        ),
      );
      await render();

      expect(screen.getByText('Continued session')).toBeInTheDocument();
      // The original may be on another installation.
      expect(
        screen.getByRole('link', { name: 'an earlier session on other-lab' }),
      ).toHaveAttribute('href', '/sessions/other-lab/0a1b2c');
      expect(
        screen.getByText('I am continuing a session with you.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/\[Continues session/)).not.toBeInTheDocument();
    });

    it('names this session, not the one before, when it is carried on after a lost runtime', async () => {
      // The new session's marker names the session it continues; the
      // earlier one's marker is not carried along in the conversation.
      mockUseSessionDetail.mockReturnValue({
        ...continuationView(
          '[Continues session other-lab/0a1b2c]\n\nI am continuing a session with you.',
        ),
        state: {
          raw: 'failed',
          key: 'failed',
          label: 'Failed',
          tone: 'danger' as const,
          isActive: false,
        },
        runtimeLoss: { reported: true, cause: 'gone', attempts: 1 },
      });
      await render();

      await userEvent.click(
        screen.getByRole('button', {
          name: 'Continue in a new session',
        }),
      );

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled();
      });
      const { prompt } = mockCreateSession.mock.calls[0][0];
      expect(prompt).toMatch(/^\[Continues session gazelle\/abc\]\n/);
      expect(prompt).toContain('User: I am continuing a session with you.');
      expect(prompt).not.toContain('other-lab');
    });

    it('shows no banner for an ordinary first message', async () => {
      mockUseSessionDetail.mockReturnValue(
        continuationView('Please continue session other-lab/0a1b2c'),
      );
      await render();

      expect(screen.queryByText('Continued session')).not.toBeInTheDocument();
    });

    describe('carrying a long conversation', () => {
      // jsdom lays nothing out: one line of the bubble's text per line of
      // the message, and the cut's ten `lh` as ten of them.
      let layout: MockedCollapsibleLayout;
      beforeEach(() => {
        layout = mockCollapsibleLayout();
      });
      afterEach(() => layout.restore());

      it('cuts the opener under the banner behind Show more', async () => {
        // The first message as "Continue in a new session" writes it: the
        // marker line, the framing and sixty earlier messages.
        const { text } = buildContinuationPrompt({
          items: Array.from({ length: 60 }, (_, i) => ({
            id: `m${i}`,
            kind:
              i % 2 ? ('agent-message' as const) : ('user-message' as const),
            taskIndex: Math.floor(i / 2),
            text: `Message ${i + 1}`,
          })),
          pendingQuestions: [],
          continues: { installation: 'other-lab', sessionId: '0a1b2c' },
        });
        expect(text).toMatch(/^\[Continues session other-lab\/0a1b2c\]/);
        mockUseSessionDetail.mockReturnValue(continuationView(text));
        await render();

        expect(screen.getByText('Continued session')).toBeInTheDocument();
        const toggle = screen.getByRole('button', { name: 'Show more' });
        const message = document.getElementById(
          toggle.getAttribute('aria-controls')!,
        )!;
        expect(message.style.maxHeight).toBe('10lh');
        // The marker is the banner, not the message's first line.
        expect(message).toHaveTextContent(
          /^I am continuing a session with you that could not be resumed/,
        );
        expect(message).toHaveTextContent('Message 60');
        expect(message).not.toHaveTextContent('[Continues session');

        await userEvent.click(toggle);
        expect(
          screen.getByRole('button', { name: 'Show less' }),
        ).toHaveAttribute('aria-expanded', 'true');
      });
    });
  });

  describe('an answer kagent did not take', () => {
    // `useAnswerConfirmation` rejects with this once a silent answer (a 202,
    // an empty stream) never reached the task: the agent could not resume,
    // and the question is still open.
    const notTaken = () => {
      const error = new Error(
        'kagent did not take the answer: the agent could not resume, and the question is still open.',
      );
      error.name = 'AnswerNotTakenError';
      return error;
    };
    const question = 'Who exactly is the audience?';
    const pendingQuestion = {
      taskId: 'task-2',
      asks: 'input' as const,
      toolName: 'ask_user',
      questions: [{ question, multiple: false }],
      askedIn: 'status-1',
    };
    const waitingView: SessionDetailView = {
      ...loadedView,
      isAgentWorking: false,
      state: awaitingInput,
      currentTaskId: 'task-2',
      pendingConfirmation: pendingQuestion,
    };
    const failedAnswer = {
      messageId: 'answer-1',
      taskId: 'task-2',
      decision: 'approve' as const,
      answers: [['Cyclists']],
      text: 'Cyclists',
      askedIn: 'status-1',
    };
    const notTakenConfirmation = (failed: PendingAnswer = failedAnswer) =>
      idleConfirmation({ error: notTaken(), failed });
    const composer = () => screen.getByRole('textbox', { name: 'Message' });
    const startButton = () =>
      screen.getByRole('button', {
        name: 'Continue in a new session',
      });

    it('replaces the question card with the error, offers no retry and shows the answer', async () => {
      mockUseSessionDetail.mockReturnValue(waitingView);
      mockUseAnswerConfirmation.mockReturnValue(notTakenConfirmation());
      await render();

      expect(
        screen.getByText('Could not resume this session'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /the question is still open and this session cannot continue/,
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('Your answer: Cyclists')).toBeInTheDocument();
      // No card, so nothing invites sending the answer again.
      expect(
        screen.queryByRole('form', { name: 'Question from the agent' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Send answer' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Send' }),
      ).not.toBeInTheDocument();
      // The session takes no more messages: no box, and the way on is in
      // the notice.
      expect(
        screen.queryByRole('textbox', { name: 'Message' }),
      ).not.toBeInTheDocument();
      const notice = screen
        .getByText('Could not resume this session')
        .closest('.bui-Alert') as HTMLElement;
      expect(
        within(notice).getByRole('button', {
          name: 'Continue in a new session',
        }),
      ).toBeInTheDocument();
      // kagent marked nothing, so the page does not claim a lost runtime.
      expect(screen.queryByText('Runtime lost')).not.toBeInTheDocument();
    });

    it('starts the new session on the whole conversation, the question and the answer', async () => {
      // An answer alone answers nothing in a session that never saw the
      // question: the first message carries the conversation so far.
      mockUseSessionDetail.mockReturnValue(waitingView);
      mockUseAnswerConfirmation.mockReturnValue(notTakenConfirmation());
      await render();

      expect(
        screen.getByText(
          /Its first message holds this conversation \(\d+ messages?\), with tools named but not their results, the open question and your answer/,
        ),
      ).toBeInTheDocument();

      await userEvent.click(startButton());

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled();
      });
      const { prompt, title } = mockCreateSession.mock.calls[0][0];
      // Its first line names this session, for the new page's banner.
      expect(prompt).toMatch(
        /^\[Continues session gazelle\/abc\]\n\nI am continuing a session with you that could not be resumed/,
      );
      expect(prompt).toContain('## Earlier conversation');
      // The conversation's own first message, as the timeline holds it.
      const firstUserMessage = timeline.items.find(
        item => item.kind === 'user-message',
      )!.text;
      expect(prompt).toContain(`User: ${firstUserMessage.trim()}`);
      expect(prompt).toContain(`## Your last question\n\n1. ${question}`);
      expect(prompt).toMatch(/## My answer\n\n1\. Cyclists$/);
      // Titled after this session, not after the framing.
      expect(title).toMatch(/^Continued: /);
      expect(mockNavigate).toHaveBeenCalledWith('/sessions/gazelle/new-1', {
        state: {
          newSession: expect.not.objectContaining({ prepared: true }),
        },
      });
      expect(mockAnswer).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('keeps one Continued prefix when a continued session is carried on again', async () => {
      mockUseSessionDetail.mockReturnValue({
        ...waitingView,
        detail: {
          ...waitingView.detail!,
          session: {
            ...waitingView.detail!.session,
            title: 'Continued: Fried potatoes',
          },
        },
      });
      mockUseAnswerConfirmation.mockReturnValue(notTakenConfirmation());
      await render();

      await userEvent.click(startButton());

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled();
      });
      expect(mockCreateSession.mock.calls[0][0].title).toBe(
        'Continued: Fried potatoes',
      );
    });

    it('shows no box and no button where no new session can be offered', async () => {
      // A plain message would strand the question the answer was for, and
      // the notice says where else to go.
      const context = mockUseAgents();
      mockUseAgents.mockReturnValue({
        ...context,
        rows: context.rows.map(row => ({
          ...row,
          sessionBlocker: 'Muster has no per-user sign-in here.',
        })),
      } as AgentsContextValue);
      mockUseSessionDetail.mockReturnValue(waitingView);
      mockUseAnswerConfirmation.mockReturnValue(notTakenConfirmation());
      await render();

      expect(
        screen.queryByRole('textbox', { name: 'Message' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Continue in a new session/ }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Your answer: Cyclists')).toBeInTheDocument();
      expect(
        screen.getByText(/cannot be started from this portal/),
      ).toBeInTheDocument();
    });

    it('does not carry a declined approval’s reason into the new session', async () => {
      mockUseSessionDetail.mockReturnValue({
        ...waitingView,
        pendingConfirmation: {
          taskId: 'task-2',
          asks: 'approval',
          toolName: 'delete_cluster',
          questions: [],
          askedIn: 'status-1',
        },
      });
      mockUseAnswerConfirmation.mockReturnValue(
        notTakenConfirmation({
          messageId: 'answer-1',
          taskId: 'task-2',
          decision: 'reject',
          rejectionReason: 'not that one',
          text: 'not that one',
          askedIn: 'status-1',
        }),
      );
      await render();

      expect(
        screen.getByText('Could not resume this session'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Your answer/)).not.toBeInTheDocument();
      await userEvent.click(startButton());
      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled();
      });
      const { prompt } = mockCreateSession.mock.calls[0][0];
      expect(prompt).toContain('## Earlier conversation');
      expect(prompt).not.toContain('not that one');
    });

    it('keeps the card and its retry for any other failure', async () => {
      // A refused or lost request can go through on a second try.
      mockUseSessionDetail.mockReturnValue(waitingView);
      mockUseAnswerConfirmation.mockReturnValue(
        idleConfirmation({
          error: new Error('The streaming send failed with status 502.'),
          failed: failedAnswer,
        }),
      );
      await render();

      expect(screen.getByText('Answer not sent')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send answer' })).toBeEnabled();
      expect(
        screen.queryByText('Could not resume this session'),
      ).not.toBeInTheDocument();
    });

    it('takes the place of a suspected runtime loss, whose retry this rules out', async () => {
      mockUseSessionDetail.mockReturnValue(waitingView);
      mockUseSendMessage.mockReturnValue(
        idleSend({
          error: new Error(
            'actor "ai-01a09e86-0da0-764b-87b1-ac52875d1e74" request timed out',
          ),
        }),
      );
      mockUseAnswerConfirmation.mockReturnValue(notTakenConfirmation());
      await render();

      expect(
        screen.getByText('Could not resume this session'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('The agent’s runtime could not be brought back'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Send' }),
      ).not.toBeInTheDocument();
    });

    it('shows a follow-up question in the same task rather than the error', async () => {
      // A late resume took the answer and the agent asked again: a new
      // question to answer, even though the task id is the same.
      mockUseSessionDetail.mockReturnValue({
        ...waitingView,
        pendingConfirmation: {
          ...pendingQuestion,
          questions: [{ question: 'Which sport first?', multiple: false }],
          askedIn: 'status-2',
        },
      });
      mockUseAnswerConfirmation.mockReturnValue(notTakenConfirmation());
      await render();

      expect(
        screen.queryByText('Could not resume this session'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('form', { name: 'Question from the agent' }),
      ).toBeInTheDocument();
    });

    it('lets go of the error once the question is no longer open', async () => {
      // A resume that lands late moves the task on; the page follows it.
      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        isAgentWorking: true,
      });
      mockUseAnswerConfirmation.mockReturnValue(notTakenConfirmation());
      await render();

      expect(
        screen.queryByText('Could not resume this session'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Continue in a new session/ }),
      ).not.toBeInTheDocument();
      expect(composer()).toHaveValue('');
    });
  });

  describe('the header', () => {
    const renderShell = render;

    // The "Show tool activity" choice lives in the test app's localStorage,
    // shared by every test here: one failing test must not leave it off for
    // the rest.
    afterEach(() => window.localStorage.clear());

    it('heads the page with the platform-standard frame', async () => {
      // The ShellPage idiom every platform page uses (All Sessions, Customize):
      // the session's name is the h1 at the standard scale, under a breadcrumb
      // that reads "Sessions / Session" — this page is one conversation, and
      // the linked ancestor is the way back to the list.
      await renderShell();

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Which GitHub issues...',
      );

      const breadcrumbs = screen.getByRole('navigation', {
        name: 'Breadcrumb',
      });
      expect(
        within(breadcrumbs).getByRole('link', { name: 'Sessions' }),
      ).toHaveAttribute('href', '/sessions');
      expect(within(breadcrumbs).getByText('Session')).toBeInTheDocument();
    });

    it('does not repeat the title in the conversation column', async () => {
      // The shell header carries the title; a second copy below it is exactly
      // the "bigger, weird position" duplicate this layout replaces.
      await renderShell();

      expect(
        screen.getAllByRole('button', { name: /Rename session/ }),
      ).toHaveLength(1);
    });

    it('keeps the header title as the way into renaming', async () => {
      await renderShell();

      await userEvent.click(
        screen.getByRole('button', {
          name: 'Rename session "Which GitHub issues..."',
        }),
      );

      expect(
        await screen.findByRole('textbox', { name: /Session name/ }),
      ).toHaveValue('Which GitHub issues...');
    });

    it('keeps the state, the agent and the installation beside the title', async () => {
      await renderShell();

      expect(screen.getByText('Working')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Issue tracker' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('installation-chip')).toHaveTextContent(
        'gazelle',
      );
      expect(screen.getByText(/^Started/)).toBeInTheDocument();
    });

    it('pins the session from the header, and shows that it is pinned', async () => {
      // The prototype's header pin. Handed to the shared header with the
      // menu, and backed by the same per-user store the rail reads.
      await renderShell();

      expect(lastProvidedActions().props.pin.isPinned).toBe(false);

      await act(async () => lastProvidedActions().props.pin.onToggle());

      await waitFor(() =>
        expect(lastProvidedActions().props.pin.isPinned).toBe(true),
      );
    });

    it('sets the session’s notifications from the ⋯ menu, and keeps them across a reload', async () => {
      // The level is kept per person, like the pin; the menu renders in the
      // shared header, so the element the page hands over is rendered here.
      const storage = mockApis.storage();
      const renderHeaderMenu = () =>
        renderInTestApp(<>{lastProvidedActions()}</>, {
          apis: [[storageApiRef, storage]],
          mountedRoutes: { '/sessions': sessionsRouteRef },
        });
      const openNotifications = async () => {
        await userEvent.click(
          screen.getByRole('button', { name: 'Session actions' }),
        );
        await userEvent.click(
          screen.getByRole('menuitem', { name: 'Notifications' }),
        );
        await screen.findByRole('menu', { name: 'Notifications' });
      };

      const page = await renderShell([[storageApiRef, storage]]);
      await waitFor(() =>
        expect(lastProvidedActions().props.notifications.level).toBe('default'),
      );
      const menu = await renderHeaderMenu();
      await openNotifications();
      expect(
        screen.getByRole('menuitemradio', { name: 'Default' }),
      ).toHaveAttribute('aria-checked', 'true');

      await userEvent.click(
        screen.getByRole('menuitemradio', { name: 'All activity' }),
      );
      await waitFor(() =>
        expect(lastProvidedActions().props.notifications.level).toBe('all'),
      );

      // A reload: the page and its menu start afresh from the stored record.
      menu.unmount();
      page.unmount();
      providedActions.mockClear();
      await renderShell([[storageApiRef, storage]]);
      await waitFor(() =>
        expect(lastProvidedActions().props.notifications.level).toBe('all'),
      );
      await renderHeaderMenu();
      await openNotifications();
      expect(
        screen.getByRole('menuitemradio', { name: 'All activity' }),
      ).toHaveAttribute('aria-checked', 'true');
      expect(
        screen.getByRole('menuitemradio', { name: 'Default' }),
      ).toHaveAttribute('aria-checked', 'false');
    });

    it('keeps the name, the state and the agent in sight once the header scrolls away', async () => {
      // ShellPage's compact header: the same header, at the top of the view
      // while the conversation is read. Where the session runs and when it
      // started stay out of it.
      const observer = mockIntersectionObserver();
      try {
        await renderShell();

        act(() => observer.report('above'));

        const header = screen.getByTestId('shell-page-header');
        expect(header).toHaveAttribute('data-compact');
        // Still the one h1, its rename button and nothing twice.
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(
          within(header).getByRole('button', {
            name: 'Rename session "Which GitHub issues..."',
          }),
        ).toBeVisible();
        expect(within(header).getByText('Working')).toBeVisible();
        expect(
          within(header).getByRole('link', { name: 'Issue tracker' }),
        ).toBeVisible();
        expect(
          screen.getAllByRole('switch', { name: 'Show tool activity' }),
        ).toHaveLength(1);
        expect(screen.getByTestId('installation-chip')).not.toBeVisible();
        expect(screen.getByText(/^Started/)).not.toBeVisible();
      } finally {
        observer.restore();
      }
    });

    /** The "Show tool activity" switch on the session's meta line (S9). */
    const toolActivitySwitch = () =>
      screen.getByRole('switch', { name: 'Show tool activity' });

    it('puts the tool activity switch on the line with the start, not among the actions', async () => {
      await renderShell();

      const started = screen.getByText(/^Started/);
      // The header holds both, the switch after the start.
      const header = screen.getByTestId('shell-page-header');
      expect(header).toContainElement(started);
      expect(header).toContainElement(toolActivitySwitch());
      expect(
        started.compareDocumentPosition(toolActivitySwitch()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(lastProvidedActions().props).not.toHaveProperty('toolActivity');
    });

    it('hides the tool activity from the switch, and remembers it', async () => {
      // S9: one switch, on by default, kept per person like the pin.
      await renderShell();

      expect(toolActivitySwitch()).toBeChecked();
      expect(
        screen.getByRole('button', { name: /Used 2 tools/ }),
      ).toBeInTheDocument();

      await userEvent.click(toolActivitySwitch());

      await waitFor(() => expect(toolActivitySwitch()).not.toBeChecked());
      expect(
        screen.queryByRole('button', { name: /Used 2 tools/ }),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/You have two open issues/)).toBeInTheDocument();
    });

    describe('toggled while reading, from the compact header', () => {
      let observer: ReturnType<typeof mockIntersectionObserver>;
      let scrollBy: jest.SpyInstance;
      let rect: jest.SpyInstance;
      beforeEach(() => {
        observer = mockIntersectionObserver();
        scrollBy = jest
          .spyOn(window, 'scrollBy')
          .mockImplementation(() => undefined);
        // jsdom lays nothing out. The agent's reply is the entry in view;
        // every work summary is laid out above it, 80px each, and the rest
        // is far above the view.
        const summaries = () =>
          document.querySelectorAll('[data-testid="timeline-work-summary"]')
            .length;
        rect = jest
          .spyOn(Element.prototype, 'getBoundingClientRect')
          .mockImplementation(function layout(this: Element) {
            const top = this.matches('[data-testid="timeline-agent-message"]')
              ? 200 + summaries() * 80
              : -1000;
            return {
              top,
              bottom: top + 40,
              left: 0,
              right: 0,
              width: 0,
              height: 40,
              x: 0,
              y: top,
              toJSON: () => ({}),
            };
          });
      });
      afterEach(() => {
        rect.mockRestore();
        scrollBy.mockRestore();
        observer.restore();
      });

      it('keeps the reply being read where it is on screen', async () => {
        await renderShell();
        act(() => observer.report('above'));
        const hidden =
          document.querySelectorAll('[data-testid="timeline-work-summary"]')
            .length * 80;
        expect(hidden).toBeGreaterThan(0);

        await userEvent.click(toolActivitySwitch());

        await waitFor(() => expect(toolActivitySwitch()).not.toBeChecked());
        // The summaries above it went, so the page follows the reply up.
        expect(scrollBy).toHaveBeenCalledWith({
          top: -hidden,
          behavior: 'instant',
        });

        scrollBy.mockClear();
        await userEvent.click(toolActivitySwitch());

        await waitFor(() => expect(toolActivitySwitch()).toBeChecked());
        expect(scrollBy).toHaveBeenCalledWith({
          top: hidden,
          behavior: 'instant',
        });
      });

      it('stays compact while the conversation reflows around the switch', async () => {
        await renderShell();
        act(() => observer.report('above'));
        const header = screen.getByTestId('shell-page-header');

        await userEvent.click(toolActivitySwitch());
        // The reflow nudges the conversation's start a few pixels into view
        // and back: no flicker.
        act(() => observer.report(8));
        act(() => observer.report(-4));
        act(() => observer.report(8));

        expect(header).toHaveAttribute('data-compact');
        await waitFor(() => expect(toolActivitySwitch()).not.toBeChecked());
        expect(header).toHaveAttribute('data-compact');
      });
    });

    it('says why the switch went back when the choice could not be stored', async () => {
      const post = jest.fn();
      const storage = mockApis.storage();
      jest
        .spyOn(storage.forBucket('agent-platform'), 'set')
        .mockRejectedValue(new Error('The settings backend is down.'));
      await renderShell([
        [storageApiRef, storage],
        [toastApiRef, { post }],
      ]);

      await userEvent.click(toolActivitySwitch());

      await waitFor(() =>
        expect(post).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Could not hide tool activity',
            description: 'The settings backend is down.',
            status: 'danger',
          }),
        ),
      );
      await waitFor(() => expect(toolActivitySwitch()).toBeChecked());
      expect(
        screen.getByRole('button', { name: /Used 2 tools/ }),
      ).toBeInTheDocument();
    });

    it('holds the conversation and the switch until the stored choice is read', async () => {
      // UserSettingsStorage answers "unknown" first and reads in the
      // background; showing the work and then hiding it would flash.
      const never = { subscribe: () => ({ unsubscribe: () => {} }) };
      const bucket = {
        snapshot: (key: string) => ({ key, presence: 'unknown' }),
        observe$: () => never,
        set: jest.fn(),
        remove: jest.fn(),
      };
      const storage = { ...bucket, forBucket: () => bucket };
      await renderShell([[storageApiRef, storage as unknown as StorageApi]]);

      expect(screen.getByTestId('progress')).toBeInTheDocument();
      expect(
        screen.queryByText(/You have two open issues/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('switch', { name: 'Show tool activity' }),
      ).not.toBeInTheDocument();
      // The rest of the line does not wait.
      expect(screen.getByText(/^Started/)).toBeInTheDocument();
    });

    it('keeps the cost chip in the composer there too', async () => {
      await renderShell();

      expect(
        within(screen.getByTestId('composer-card')).getByRole('button', {
          name: /Session cost and context/,
        }),
      ).toBeInTheDocument();
    });
  });

  describe('on a phone (T22)', () => {
    let layout: MockedLayout;
    afterEach(() => layout?.restore());

    const waitingView = {
      ...loadedView,
      isAgentWorking: false,
      state: awaitingInput,
      pendingConfirmation: {
        taskId: 'task-1',
        asks: 'input' as const,
        toolName: 'ask_user',
        questions: [{ question: 'Which cluster?', multiple: false }],
      },
    };

    it('publishes the dock’s height on the document for the toasts, and takes it away with the dock (B4)', async () => {
      const root = document.documentElement;
      const { unmount } = await render();

      expect(root.style.getPropertyValue('--session-dock-height')).toMatch(
        /^\d+px$/,
      );

      unmount();
      expect(root.style.getPropertyValue('--session-dock-height')).toBe('');
    });

    it('publishes no dock height where the composer is withheld', async () => {
      mockUseSessionDetail.mockReturnValue({
        ...loadedView,
        detail: { ...loadedView.detail!, readOnly: true },
      });
      await render();

      expect(screen.queryByTestId('session-dock')).not.toBeInTheDocument();
      expect(
        document.documentElement.style.getPropertyValue(
          '--session-dock-height',
        ),
      ).toBe('');
    });

    it('folds the disabled composer to its caption under an open question (B21)', async () => {
      layout = mockPhoneLayout();
      mockUseSessionDetail.mockReturnValue(waitingView);
      await render();

      const dock = screen.getByTestId('session-dock');
      expect(
        within(dock).getByRole('form', { name: 'Question from the agent' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('textbox', { name: 'Message' }),
      ).not.toBeInTheDocument();
      expect(within(dock).getByTestId('composer-folded')).toHaveTextContent(
        'Issue tracker is waiting for your answer above.',
      );
      // The cost chip stays reachable beside the caption.
      expect(
        within(dock).getByRole('button', { name: /Session cost and context/ }),
      ).toBeInTheDocument();
    });

    it('keeps the disabled composer under the question on a desktop', async () => {
      layout = mockDesktopLayout();
      mockUseSessionDetail.mockReturnValue(waitingView);
      await render();

      expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled();
    });

    it('docks the notice with its button, and no box, once an answer was not taken', async () => {
      // The question card goes, and the session takes no more messages: the
      // dock holds the notice, its button and the cost chip.
      layout = mockPhoneLayout();
      mockUseSessionDetail.mockReturnValue(waitingView);
      const notTaken = new Error('kagent did not take the answer.');
      notTaken.name = 'AnswerNotTakenError';
      mockUseAnswerConfirmation.mockReturnValue(
        idleConfirmation({
          error: notTaken,
          failed: {
            messageId: 'answer-1',
            taskId: 'task-1',
            decision: 'approve',
            answers: [['prod']],
            text: 'prod',
          },
        }),
      );
      await render();

      const dock = screen.getByTestId('session-dock');
      expect(
        within(dock).getByText('Could not resume this session'),
      ).toBeInTheDocument();
      expect(within(dock).getByText('Your answer: prod')).toBeInTheDocument();
      expect(
        within(dock).queryByRole('textbox', { name: 'Message' }),
      ).not.toBeInTheDocument();
      expect(
        within(dock).getByRole('button', {
          name: 'Continue in a new session',
        }),
      ).toBeInTheDocument();
      expect(
        within(dock).getByRole('button', { name: /Session cost and context/ }),
      ).toBeInTheDocument();
    });
  });
});
