import {
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Link } from '@backstage/core-components';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { Alert, Badge, Button, Flex, Switch, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  DateComponent,
  EmptyStateCard,
  LoadingIndicator,
  SHELL_PAGE_PADDING_BOTTOM_VAR,
  ShellPage,
  ShellPageBadgeSkeleton,
  ShellPageExpandedOnly,
  ShellPageTitleSkeleton,
  StatusDot,
  TOUCH_MEDIA,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';

import { isConflictError, isUnauthorizedError } from '../../apis';
import { useCancelTask } from '../../hooks/useCancelTask';
import { useCreateSession } from '../../hooks/useCreateSession';
import { useDeleteSession } from '../../hooks/useDeleteSession';
import { useExportSession } from '../../hooks/useExportSession';
import { useKagentCapabilities } from '../../hooks/useKagentCapabilities';
import {
  isAnswerNotTakenError,
  useAnswerConfirmation,
} from '../../hooks/useAnswerConfirmation';
import {
  modelConfigNameOf,
  NEW_SESSION_STATE_KEY,
  stashHandoffImages,
  useNewSessionHandoff,
} from '../../hooks/useNewSessionHandoff';
import {
  ComposerImage,
  imagesUnsupportedReason,
} from '../../lib/messageImages';
import { useRenameSession } from '../../hooks/useRenameSession';
import { useChatGptConnection } from '../../hooks/useChatGptConnection';
import { useSendMessage } from '../../hooks/useSendMessage';
import { useSessionDetail } from '../../hooks/useSessionDetail';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useAgentIndex } from '../../hooks/useAgentIndex';
import { usePinnedSessions } from '../../hooks/usePinnedSessions';
import { useSessionNotificationSettings } from '../../hooks/useSessionNotificationRecord';
import { useShowToolActivity } from '../../hooks/useShowToolActivity';
import { useWorkspaceNames } from '../../hooks/useWorkspaceNames';
import { useMusterServers } from '../../hooks/useMusterServers';
import { connectorOfTool } from '../../lib/toolset';
import { AvatarSize } from '../../lib/agentAvatar';
import {
  AWAITING_INPUT_STATES,
  describeSessionState,
  isRuntimeLostFailureText,
  RuntimeLoss,
  SessionState,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  agentDetailRouteRef,
  agentEditRouteRef,
  sessionDetailRouteRef,
  sessionsRouteRef,
} from '../../routes';
import { InstallationChip } from '../InstallationChip';
import { SessionWorkspaceChip } from '../SessionWorkspace';
import { PendingConfirmationPanel } from '../PendingConfirmationPanel';
import { SessionComposer } from '../SessionComposer';
import {
  ChatGptConnectDialog,
  ChatGptConnectPrompt,
  CHATGPT_CONNECT_REASON,
} from '../ChatGptConnectPrompt';
import {
  RUNTIME_LOST_LABEL,
  RUNTIME_LOST_TITLE,
  STATE_IDLE_LABEL,
} from '../SessionsTable';
import { sessionStateDotVar } from '../../lib/stableClassNames';
import {
  createPolledPairing,
  fresherStreamedCopy,
  readLastUserMessage,
  readUnansweredUserMessage,
  withFailedSend,
  STALLED_STATE_LABEL,
} from './helpers';
import { RuntimeLostNotice } from './RuntimeLostNotice';
import { AnswerNotTakenNotice } from './AnswerNotTakenNotice';
import {
  buildContinuationPrompt,
  splitContinuation,
} from '../../lib/continuationPrompt';
import { ContinuedSessionBanner } from './ContinuedSessionBanner';
import type { NotificationLevel } from '../../lib/notificationRecord';
import { SessionActionsMenu } from './SessionActionsMenu';
import { useReadingAnchor } from './useReadingAnchor';
import { SessionRenameDialog } from './SessionRenameDialog';
import {
  COLUMN_RESERVE_VAR,
  DOCK_HEIGHT_VAR,
  useDockedComposerLayout,
} from './useDockedComposerLayout';
import {
  SESSION_TITLE_FALLBACK,
  toSessionRow,
} from '../SessionsDataProvider/helpers';
import { SessionTimeline, StreamLossPhase } from '../SessionTimeline';
import { SessionCostPopover } from '../SessionCostPopover';
import { estimateCost } from '../../lib/costEstimate';
import { describeCostBasis } from '../../lib/costBasis';
import { TimelineItem } from '../../lib/kagentTimeline';
import { useTokenRates } from '../../hooks/useTokenRates';
import { useSessionEgressRefusals } from '../../hooks/useSessionEgressRefusals';
import { withEgressRefusals } from '../../lib/egressRefusals';
import { AgentAvatar } from '../AgentAvatar';

/** Long enough to read why the switch went back, like the other failure toasts. */
const TOOL_ACTIVITY_TOAST_TIMEOUT_MS = 12000;

/** No installation's workspaces to read, for a session without a workspace. */
const NO_INSTALLATIONS: string[] = [];

/** Matches the list's row avatar: one line of text, 2× for hi-dpi. */
const AVATAR_SIZE: AvatarSize = 48;

/**
 * How a session that carries on another is titled: the earlier title after a
 * prefix, which a further continuation replaces rather than stacks.
 */
const CONTINUED_TITLE_PREFIX = 'Continued: ';
const CONTINUED_TITLE_PATTERN = /^(?:Continued: )+/;

const useStyles = makeStyles(theme => ({
  // bui's Switch has one size, sized for forms. On the meta line it takes the
  // line's text size and a proportionally smaller track (1.5 × 0.875rem
  // rather than 2 × 1.143rem: two thumbs plus their margins wide, so bui's
  // `translateX(100%)` still lands the thumb at the end). One unit when the
  // line wraps at phone width.
  toolActivitySwitch: {
    gap: 'var(--bui-space-2)',
    fontSize: 'var(--bui-font-size-2)',
    lineHeight: 1.4,
    color: 'var(--bui-fg-secondary)',
    whiteSpace: 'nowrap',
    // A 44px thumb target on touch without a taller line: the padding widens
    // what the label catches, the negative margin gives the height back.
    [TOUCH_MEDIA]: {
      paddingBlock: 14,
      marginBlock: -14,
    },
    '& .bui-SwitchIndicator': {
      flexShrink: 0,
      width: '1.5rem',
      height: '0.875rem',
      borderRadius: '0.875rem',
      '&::before': {
        width: '0.625rem',
        height: '0.625rem',
        margin: '0.125rem',
      },
    },
  },
  // One readable column, like any chat surface: full-bleed prose is hard to
  // scan, and the conversation is what this page is for.
  //
  // At least the view's height less the chrome around it (measured, see
  // `useDockedComposerLayout`), so the docked composer sits at the bottom of
  // the view from the first message on — the T36 wizard-bar rule — and new
  // messages fill the room above it rather than pushing it down. Until the
  // measurement lands the reserve is the whole view, i.e. no minimum at all.
  column: {
    width: '100%',
    maxWidth: 920,
    margin: '0 auto',
    minHeight: `calc(100dvh - var(${COLUMN_RESERVE_VAR}, 100dvh))`,
    // JSS puts the fallback first, so browsers without dvh keep vh.
    fallbacks: {
      minHeight: `calc(100vh - var(${COLUMN_RESERVE_VAR}, 100vh))`,
    },
    // A control in the conversation that the browser scrolls into view — a
    // fold-out opened from the keyboard, a tab stop — lands clear of the dock
    // (and of the shell's mobile bottom bar under it), however tall a question
    // card has made the dock.
    '& > :not($bottomDock) :is(button, a, input, textarea, [tabindex])': {
      scrollMarginBottom: `calc(var(${DOCK_HEIGHT_VAR}, 0px) + var(--agent-shell-mobile-bar-height, 0px) + ${theme.spacing(2)}px)`,
    },
  },
  // The chat bar: the composer, its caption, and whatever must be answered or
  // read before the next message — a question card attached to the box, a
  // lost-runtime notice, a rejected send — docked to the view's bottom edge
  // like a chat app's input bar (T40). Sticky at the column's end rather than
  // `fixed`: it keeps its own room in the flow, so at full scroll the last
  // message sits above it, never under it, and "scroll to the newest" is just
  // the document's end. `marginTop: auto` keeps it at the bottom of a column
  // the conversation does not fill yet. Always docked, the card included: the
  // card is compact and caps its own height (`PendingConfirmationPanel`), so
  // the bar cannot outgrow a phone's view. The gap keeps whatever shares the
  // dock off the composer's box; neither bui's Alert nor the composer's form
  // has a margin.
  bottomDock: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    marginTop: 'auto',
    position: 'sticky',
    // At phone width the agent shell draws a fixed bottom bar; the variable
    // (agent-shell.css) is its height there and 0px everywhere else. Without
    // the offset the bar covered the composer.
    bottom: 'var(--agent-shell-mobile-bar-height, 0px)',
    zIndex: 1,
    backgroundColor: `var(--bui-bg-app, ${theme.palette.background.default})`,
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(2),
    // Into the page's bottom padding, all of it: the bar's own padding is the
    // room under the box. At the end of the scroll the sticky bar rests at its
    // place in the flow, and a fixed -16px left ShellPage's 40px less that
    // under it — the bar lifted 24px as the scroll reached the end (live round
    // 2, R7). ShellPage publishes its padding; 16px where no ShellPage wraps
    // the page, as before.
    marginBottom: `calc(-1 * var(${SHELL_PAGE_PADDING_BOTTOM_VAR}, ${theme.spacing(
      2,
    )}px))`,
  },
  // A real <button>, stripped of its chrome, rather than a click handler on the
  // heading: the title is an editing affordance, and only a button is reachable
  // by keyboard and announced as actionable. Everything visual is inherited so
  // it still reads as the heading it replaced.
  titleButton: {
    appearance: 'none',
    background: 'none',
    border: 'none',
    padding: 0,
    margin: 0,
    font: 'inherit',
    color: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
}));

/**
 * Link back to the list.
 *
 * `useRouteRef` returns undefined when the route is not bound — which in practice
 * means the Agent Platform extension is disabled, and then this page isn't
 * rendering either. Rendering nothing is still better than hardcoding the path,
 * which would silently rot if the route moved.
 */
function BackToSessions({ children }: { children: ReactNode }) {
  const sessionsRoute = useRouteRef(sessionsRouteRef);
  if (!sessionsRoute) {
    return null;
  }
  return <Link to={sessionsRoute()}>{children}</Link>;
}

/**
 * The page's outer frame: the platform-standard page frame (`ShellPage`, the
 * one All Sessions and Customize use) — breadcrumbs reading
 * "Sessions / Session", the session's name as the h1 at the standard scale,
 * and the badges beside it. The actions the page registers land in that
 * header's slot.
 *
 * A separate component so every one of the page's exits gets it — loading,
 * not-found, unreadable, and the real thing.
 */
function Shell({
  title,
  documentTitle,
  badges,
  meta,
  compactHeader,
  children,
}: {
  /** The shell header's h1; the exits leave it to the fallback "Session". */
  title?: ReactNode;
  /** The session's name for the document title, as the h1 is a button. */
  documentTitle?: string;
  /** The shell header's badge row: state, agent, installation. */
  badges?: ReactNode;
  /** Muted text at the end of that row: when the session started. */
  meta?: ReactNode;
  /** Whether the header turns compact once it has scrolled away. */
  compactHeader?: boolean;
  children: ReactNode;
}) {
  const sessionsRoute = useRouteRef(sessionsRouteRef);

  return (
    <ShellPage
      // The exits (loading, not found, unreadable) have no name to show;
      // "Session" keeps the frame honest about where the reader is.
      title={title ?? 'Session'}
      documentTitle={[documentTitle || 'Session', 'Sessions']}
      // Singular "Session" last: this page is one conversation, and the
      // linked "Sessions" ancestor is the way back to the list.
      breadcrumbs={[
        { label: 'Sessions', href: sessionsRoute?.() },
        { label: 'Session' },
      ]}
      badges={badges}
      meta={meta}
      compactHeader={compactHeader}
    >
      {children}
    </ShellPage>
  );
}

/**
 * Why a Stop failed, for the person who pressed it.
 *
 * The backend's message, which names the refusal, plus what to do about it
 * where that is known. A 401 is the observed case: the Backstage pod rolled
 * while the tab stayed open and the tab's token no longer verifies — nothing is
 * wrong with the turn, and reloading signs the tab back in silently, after
 * which Stop works. Left as "Failed user token verification" that is a riddle.
 */
function describeStopFailure(error: Error | null): string | undefined {
  if (!error) {
    return undefined;
  }
  if (isUnauthorizedError(error)) {
    return `${error.message}. Your sign-in expired — reload the page and stop the turn again.`;
  }
  return error.message;
}

/**
 * One kagent session: what it was, how it ended, and what the agent did.
 *
 * The session can be **continued** through the composer at the bottom (see
 * "Continuing a session" in docs/agent-platform.md), **renamed** — from the header's
 * actions menu or by clicking the title — and **deleted** from that menu.
 *
 * It is also where a session's **first** message is sent. Starting a session creates it
 * on the previous screen and hands the prompt over through the router state, because
 * `message/send` blocks for the whole turn; see "Starting a session" in the same
 * document for why the send lands here rather than there.
 *
 * What the prototype shows and this cannot, because kagent stores none of it:
 * tokens-per-second, the owning team, the trigger that started the session, a
 * linked work item, produced results, and evaluation. Please don't re-add them
 * speculatively — there is no data behind them. Cost (estimated + reported) and
 * context-window usage live in the composer's `SessionCostPopover` chip, from
 * the data that does exist.
 */
export function SessionDetailPage() {
  const classes = useStyles();
  const { installation = '', sessionId = '' } = useParams();
  const buildAvatarUrl = useAgentAvatarUrl();

  // Before the reads, because it gates them: a delete is in flight from this very
  // page, and an interval landing between "kagent accepted the delete" and the
  // caller's `navigate()` would 404 and flash "Session not found" at someone who
  // just deleted it deliberately.
  const deletion = useDeleteSession(installation, sessionId);
  const { isUserScoped } = useKagentCapabilities(installation);
  // Tool calls name their connector as Customize does (UX review M2), from
  // the installation's MCPServer CRs.
  const { servers: musterServers, labels: connectorLabelsOf } =
    useMusterServers(installation);
  const connectorOf = useCallback(
    (toolName: string) =>
      connectorOfTool(toolName, musterServers, connectorLabelsOf),
    [musterServers, connectorLabelsOf],
  );

  // The prompt this session was started with, if the user arrived here by
  // starting it. Read once and cleared, so returning to the session later cannot
  // re-send it. See `useNewSessionHandoff`.
  const handoff = useNewSessionHandoff();

  const {
    detail,
    timeline,
    state,
    currentTaskId,
    isAgentWorking: agentIsWorking,
    turnProgress,
    pendingConfirmation,
    runtimeLoss: conversationRuntimeLoss,
    taskCount,
    hasConversation,
    isLoading,
    isNotFound,
    error,
  } = useSessionDetail(installation, sessionId, {
    enabled: !deletion.isDeleting && !deletion.isDeleted,
    // Arriving with a handoff means the session was created a moment ago, and
    // its first reads can miss it for a beat: the page keeps loading through
    // that instead of flashing an error (T86).
    justCreated: Boolean(handoff),
  });
  const cancellation = useCancelTask(installation, sessionId);

  // The same join the list uses, so a session's agent is named identically in both
  // places — and falls back to the same lossy decode when no Agent CR matched.
  const agentIndex = useAgentIndex();

  const row = useMemo(
    () => (detail ? toSessionRow(detail.session, agentIndex) : undefined),
    [detail, agentIndex],
  );
  // The workspace's name, from the installation's workspace list: read only
  // for a session that works in one.
  const workspaceNameOf = useWorkspaceNames(
    row?.workspace ? [row.installation] : NO_INSTALLATIONS,
  );
  const workspaceName = row ? workspaceNameOf(row) : undefined;

  // `useDeleteSession`, `useRenameSession` and `useKagentCapabilities` are all called
  // here rather than inside the menu: the menu is rendered in the shared plugin
  // header, which is outside this plugin's `QueryClientProvider`, so a mutation or a
  // query has no client there. The capabilities probe is a cached `/me` read with an
  // hour's staleTime, so asking for it on this page is free.
  const rename = useRenameSession(installation, sessionId);

  // Undefined when no `Agent` CR matched the session's encoded `agent_id`, which
  // is what withholds the composer: without the agent's real namespace and name
  // there is no A2A endpoint to address, and the encoding cannot be safely
  // decoded back into one.
  //
  // A handoff supplies it directly, and takes precedence for one render's worth of
  // reason: the join above needs both the session read and the fleet-wide Agent
  // list, so on a session created a moment ago it resolves a beat late — and the
  // first message has to be dispatchable immediately. The two agree by
  // construction, since the composer created the session against this agent.
  const agent = useMemo(() => {
    if (row?.agentNamespace && row.agentTechnicalName) {
      return { namespace: row.agentNamespace, name: row.agentTechnicalName };
    }
    return handoff
      ? { namespace: handoff.agentNamespace, name: handoff.agentName }
      : undefined;
  }, [row?.agentNamespace, row?.agentTechnicalName, handoff]);
  // The agent's own page, for the link on its name in the header below.
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);
  // Its edit page, where an egress refusal on the timeline points.
  const agentEditRoute = useRouteRef(agentEditRouteRef);
  const agentEgressHref = agent
    ? agentEditRoute?.({ installation, ...agent })
    : undefined;

  const send = useSendMessage(installation, sessionId, agent);
  const confirmation = useAnswerConfirmation(installation, sessionId, agent);

  /**
   * The runtime kagent cannot bring back, from every place it can show.
   *
   * The conversation's reading (`useSessionDetail`) covers the common path: the
   * gateway records the failed turn with the runtime's words *before* it ends
   * the stream, so the poll shows a failed turn and the hook reads it. The
   * send's and the answer's own errors cover the other: a failure kagent
   * reported in-band before any event, or one the transport mapped, whose
   * message carries the same words. Either way the words are the runtime's
   * and are shown as the evidence, never as the explanation.
   */
  const runtimeLoss = useMemo<RuntimeLoss | undefined>(() => {
    if (conversationRuntimeLoss) {
      return conversationRuntimeLoss;
    }
    const cause = [send.error?.message, confirmation.error?.message].find(
      isRuntimeLostFailureText,
    );
    return cause ? { reported: false, cause, attempts: 1 } : undefined;
  }, [conversationRuntimeLoss, send.error, confirmation.error]);

  /**
   * The answer kagent did not take: the agent could not resume, and the
   * question it answered is still open (`useAnswerConfirmation`). Terminal like
   * a reported runtime loss — the card and the box go, the notice offers the
   * new session — but only while **that** question stands: the same task, asking
   * in the same status message. A resume that lands late moves the task on,
   * and a follow-up question in the same task is a new one to answer.
   */
  /**
   * The conversation as kagent recorded it, with a continuation's marker line
   * taken out of the first message: what a new session is built from, and
   * what the person's last message is read from. A marker carried along would
   * link the next session to the wrong one.
   */
  const conversationItems = useMemo(
    () => splitContinuation(timeline.items).items,
    [timeline.items],
  );
  const failedAnswer = confirmation.failed;
  /** The failed answer is to the request that still stands. */
  const failedAnswerStands =
    failedAnswer !== null &&
    pendingConfirmation !== undefined &&
    pendingConfirmation !== null &&
    failedAnswer.taskId === pendingConfirmation.taskId &&
    failedAnswer.askedIn === pendingConfirmation.askedIn;
  const answerNotTaken =
    isAnswerNotTakenError(confirmation.error) && failedAnswerStands;
  /** Nothing more can happen in this session; the way on is a new one. */
  const cannotContinue = Boolean(runtimeLoss?.reported) || answerNotTaken;
  /**
   * Whether this page offers to carry the session on in a new one: after a
   * lost runtime (suspected or reported) and after an answer kagent did not
   * take. The new session starts with this one's conversation either way.
   */
  const carriesOn = answerNotTaken || Boolean(runtimeLoss);
  /**
   * The answer that did not reach the agent — not taken, or lost with the
   * runtime: a question's answers, positionally. Not an approval's words (a
   * decline's reason), which say nothing as an answer to a new session. Shown
   * in the notice, and carried into the new session's first message.
   */
  const failedAnswers =
    carriesOn &&
    failedAnswerStands &&
    failedAnswer?.decision === 'approve' &&
    failedAnswer.answers?.length
      ? failedAnswer.answers
      : undefined;
  const failedAnswerText = failedAnswers ? failedAnswer?.text : undefined;
  /**
   * What the session that carries this one on starts with: the first message,
   * holding the whole conversation, the open question and the answer
   * (`buildContinuationPrompt`), and the images of the message that never got
   * its answer, which the conversation names. Nothing the box holds: a
   * session that cannot go on shows no box, and a suspected loss keeps its
   * box for the retry. Built once, so the notice says what the start sends.
   */
  const continuation = useMemo(() => {
    if (!carriesOn) {
      return undefined;
    }
    const items = withFailedSend(conversationItems, send.failed);
    return {
      ...buildContinuationPrompt({
        items,
        pendingQuestions: pendingConfirmation?.questions ?? [],
        answers: failedAnswers,
        continues: { installation, sessionId },
      }),
      images: readUnansweredUserMessage(items)?.images ?? [],
    };
  }, [
    carriesOn,
    conversationItems,
    send.failed,
    pendingConfirmation,
    failedAnswers,
    installation,
    sessionId,
  ]);

  /**
   * The agent, as a row the create path takes — the same join the composer
   * that starts sessions from the list makes, so the new session is created
   * against the agent's real namespace and technical name.
   */
  const agentRow = useMemo(
    () =>
      detail?.session.agentId
        ? agentIndex.get(`${installation}|${detail.session.agentId}`)
        : undefined,
    [agentIndex, installation, detail?.session.agentId],
  );

  // The agent's model may be the person's own ChatGPT subscription, which
  // takes no turn until the person has connected it. The hand-off names the
  // ModelConfig before the agent list has joined.
  const chatGpt = useChatGptConnection(
    installation,
    agent && {
      namespace: agent.namespace,
      name: (agentRow && modelConfigNameOf(agentRow)) ?? handoff?.modelConfig,
    },
  );
  // Kept here, not in the prompt: the dialog stays open, reading Connected,
  // after the prompt has gone.
  const [isChatGptDialogOpen, setChatGptDialogOpen] = useState(false);

  // The $/token to price this session's tokens at, and which observation it
  // came from. The **model** is what matters: pricing an Opus session at the
  // installation's Sonnet-derived blend halved a real session's figure, so a
  // known model with no observed price yields no rate rather than borrowing
  // another model's — see `useTokenRates`.
  //
  // Two Mimir queries, independent of everything above, so an installation
  // without an observability stack loses this one stat and keeps the page.
  const {
    rates,
    tier: rateTier,
    window: rateWindow,
  } = useTokenRates(installation, {
    namespace: agent?.namespace,
    name: agent?.name,
    model: row?.agentModel,
  });

  const estimatedCostUsd = estimateCost(
    timeline.tokens.prompt,
    timeline.tokens.completion,
    rates,
  );

  // What the composer needs to know about images: whether this agent can take
  // them, and how much the conversation already carries — every turn sends
  // the model all of it, so a session has a budget of its own.
  // The budget counts the images the person sent, which every turn resends;
  // a file the agent produced is not one of them.
  const composerImages = useMemo(() => {
    const session = { bytes: 0, count: 0 };
    for (const item of timeline.items) {
      if (
        item.kind === 'attachment' &&
        item.isUser &&
        item.preview.kind === 'image'
      ) {
        session.bytes += item.preview.byteSize;
        session.count += 1;
      }
    }
    return {
      // Not guessed while the agent is still being looked up.
      unsupportedReason: agentRow
        ? imagesUnsupportedReason(agentRow)
        : 'The portal cannot tell yet whether this agent can take images: it has not read the agent. Try again in a moment.',
      session,
    };
  }, [agentRow, timeline.items]);

  // Dispatch the session's first message, once.
  //
  // The create and the send are two kagent calls, and only the create happened
  // before we got here: a session is a shell, and `message/send` blocks for the
  // whole turn — so making the composer wait for it would have meant staring at
  // the list for up to half a minute. Sending from here instead means the
  // optimistic echo, the "Working…" row and the failure path are all the ones that
  // already exist for a reply.
  const { sendMessage } = send;
  const dispatched = useRef(false);
  useEffect(() => {
    if (!handoff || dispatched.current) {
      return;
    }
    // An agent on the person's own ChatGPT subscription takes no turn until
    // the person has connected it: the message waits, and goes once they have.
    if (chatGpt.isLoading || chatGpt.blocksTurn) {
      return;
    }
    dispatched.current = true;
    // Errors surface through `send.error` and `send.failed`, exactly as they do
    // for a reply typed into the composer — which is also what hands the text
    // back so it is not lost.
    sendMessage(handoff.text, handoff.images).catch(() => {});
  }, [handoff, sendMessage, chatGpt.isLoading, chatGpt.blocksTurn]);
  // A hand-off still undispatched is the first message waiting for the
  // connection, said on the prompt.
  const chatGptHoldsHandoff = Boolean(handoff) && chatGpt.blocksTurn;

  // The message the user just sent, shown as the newest turn before kagent's copy
  // of it has been read back — a turn can run for minutes, and a conversation that
  // did not visibly change would look like the send was lost.
  //
  // Appended to the items rather than rendered separately so it groups, styles and
  // reads exactly like any other user message. It disappears by *recognition*, not
  // by timing: once a poll returns a message carrying the same `messageId`, the
  // real one is already on screen and this stand-in must go, or the message shows
  // twice for the rest of the turn.
  //
  // The agent's side of that same turn follows the identical pattern, live: while
  // a send streams, its completed items (text, reasoning, tool calls) and the text
  // still being produced are appended after the stand-in, so the reply appears as
  // it is written rather than when the turn ends. The preview coexists with the
  // 10 s poll rather than replacing it: a streamed item whose `messageId` the poll
  // has already delivered is dropped by recognition — exactly like the stand-in,
  // except that what it knows beyond the polled copy carries over — and the whole
  // preview is discarded once the send's awaited invalidation has
  // put the canonical history on screen (`useSendMessage` clears `stream` then).
  //
  // An answer to a confirmation streams the resumed turn the same way, through
  // the same reducer, so its preview merges through this one path. At most one
  // of the two is in flight: the question card disables the composer while a
  // question is open.
  const answerStream = confirmation.stream;
  const timelineWithLive = useMemo(() => {
    const pending = send.pending;
    const stream = send.stream ?? answerStream;

    const pendingVisible =
      pending &&
      !timeline.items.some(item => item.messageId === pending.messageId);
    const streamVisible =
      stream && (stream.items.length > 0 || Boolean(stream.live));

    if (!pendingVisible && !streamVisible) {
      return timeline;
    }

    // The turn these additions belong to. Once a poll has seen the sent message,
    // its task exists and carries the real index; before that the turn is new,
    // and the stats strip still reports the server's count — "Turns" lags by one
    // until kagent confirms, which is the honest reading, since no task exists
    // yet.
    const sentMessageId = stream?.sentMessageId ?? pending?.messageId;
    const sentItem = sentMessageId
      ? timeline.items.find(item => item.messageId === sentMessageId)
      : undefined;
    const taskIndex =
      sentItem?.taskIndex ?? (timeline.items.at(-1)?.taskIndex ?? -1) + 1;

    const items = [...timeline.items];

    if (pendingVisible) {
      items.push({
        kind: 'user-message' as const,
        id: `pending:${pending.messageId}`,
        messageId: pending.messageId,
        taskIndex,
        text: pending.text,
      });
      // Its images after it, as kagent's copy will have them. Previewed from
      // what the composer already checked and encoded: this runs on every
      // streamed delta, and reading megabytes of base64 again each time would
      // stall the stream.
      for (const image of pending.images ?? []) {
        items.push({
          kind: 'attachment' as const,
          id: `pending:${pending.messageId}:${image.id}`,
          messageId: pending.messageId,
          taskIndex,
          isUser: true,
          name: image.name,
          declaredType: image.mediaType,
          preview: {
            kind: 'image',
            type: image.mediaType,
            dataUrl: image.previewUrl,
            byteSize: image.byteSize,
          },
        });
      }
    }

    if (streamVisible) {
      const pairWithPolled = createPolledPairing(timeline.items);
      /**
       * Whether the poll holds a copy of a streamed item — which then stays,
       * advanced by whatever the stream has seen since that read. A part of a
       * message the read had not reached yet has no copy, and is still the
       * stream's to show.
       */
      const advance = (streamed: TimelineItem): boolean => {
        const at = pairWithPolled(streamed);
        if (at === undefined) {
          return false;
        }
        items[at] = fresherStreamedCopy(items[at], streamed) ?? items[at];
        return true;
      };
      // How a turn ended carries a `messageId` only when kagent wrote a reason
      // for it — the exception for a failure, the rule for a cancel, which has no
      // reason to write. Recognition by id therefore cannot retire the streamed
      // entry once the poll delivers its own, and the two rendered one under the
      // other for as long as the send's remaining invalidation took. A turn has
      // one ending, so the poll having closed *this* turn is what retires it.
      const polledEndedTurn = timeline.items.some(
        item => item.kind === 'turn-failed' && item.taskIndex === taskIndex,
      );
      for (const item of stream.items) {
        if (advance(item)) {
          continue;
        }
        if (item.kind === 'turn-failed' && polledEndedTurn) {
          continue;
        }
        items.push({ ...item, taskIndex });
      }
      // Appended, never sorted: the reducer keeps the open run newer than every
      // completed item, so the end of the list is where it belongs.
      const live = stream.live;
      if (live && live.text.trim()) {
        const liveItem: TimelineItem = {
          kind: live.kind,
          id: 'stream:live',
          taskIndex,
          messageId: live.messageId,
          author: live.author,
          text: live.text.trim(),
        };
        if (!advance(liveItem)) {
          items.push(liveItem);
        }
      }
    }

    return { ...timeline, items };
  }, [timeline, send.pending, send.stream, answerStream]);

  /**
   * The session this one carries on, from the marker the portal puts on a
   * continuation's first line (`buildContinuationPrompt`), and the timeline
   * with that line taken out: the banner above the conversation shows it
   * instead, with a link. Read off the live timeline, so it shows from the
   * moment the first message is sent.
   */
  const { items: shownItems, continues: continuedFrom } = useMemo(
    () => splitContinuation(timelineWithLive.items),
    [timelineWithLive.items],
  );
  // The Session's egress refusals, on the turns that met them: counted by the
  // egress gateway, not kagent, so read beside the conversation.
  const egressRefusals = useSessionEgressRefusals({
    installation,
    sessionId,
    agentNamespace: agent?.namespace,
    createdAt: row?.createdAt,
  });
  const shownTimeline = useMemo(
    () => ({
      ...timelineWithLive,
      items: withEgressRefusals(shownItems, egressRefusals),
    }),
    [timelineWithLive, shownItems, egressRefusals],
  );

  // Owned by the page, unlike the delete dialog's state, because two things open
  // this one: the menu item and the title.
  const [isRenameOpen, setRenameOpen] = useState(false);
  const { reset: resetRename } = rename;
  const openRename = useCallback(() => {
    // Clear a previous attempt's error, so the dialog does not open still showing
    // it.
    resetRename();
    setRenameOpen(true);
  }, [resetRename]);

  /** Shared by the heading, the actions menu and both dialogs, so all of them agree. */
  const sessionTitle = row?.title || SESSION_TITLE_FALLBACK;

  // `deletion` is memoized on its own contents, `sessionTitle` is a string and
  // `openRename` is stable, so this element's identity only changes when one of them
  // actually does — which is what keeps the header slot from re-registering (and
  // re-rendering) on every poll.
  // The header's pin: pins are what order the shell's rail and sessions
  // list. Storage backed rather than react-query backed, so it works from the shared header.
  const { isPinned, togglePin } = usePinnedSessions();
  const rowId = row?.id;
  const pinned = rowId ? isPinned(rowId) : false;
  const pin = useMemo(
    () =>
      rowId
        ? {
            isPinned: pinned,
            onToggle: () => {
              // A failed write only loses the pin; the button keeps showing
              // the stored state.
              togglePin(rowId).catch(() => {});
            },
          }
        : undefined,
    [rowId, pinned, togglePin],
  );

  // The menu's Notifications submenu: the session's Notification level, kept
  // per person in the same storage as the pin.
  const notificationSettings = useSessionNotificationSettings();
  const notificationLevel = notificationSettings.isKnown
    ? notificationSettings.levelOf(installation, sessionId)
    : undefined;
  const { setLevel } = notificationSettings;
  const notifications = useMemo(
    () => ({
      level: notificationLevel,
      onChange: (level: NotificationLevel) =>
        setLevel(installation, sessionId, level),
    }),
    [notificationLevel, setLevel, installation, sessionId],
  );

  // Whether the conversation shows the agent's tool activity, kept per
  // person through the StorageApi like the pin.
  const toastApi = useApi(toastApiRef);
  const {
    showToolActivity,
    isKnown: isToolActivityKnown,
    setShowToolActivity,
  } = useShowToolActivity();
  // Adding or removing the work summaries around the place being read must
  // not move it: from the compact header the switch is pressed mid-session.
  const captureReadingAnchor = useReadingAnchor(showToolActivity);
  const changeToolActivity = useCallback(
    (show: boolean) => {
      captureReadingAnchor();
      // A failed write puts the switch and the conversation back to the
      // stored choice, so say why rather than let it snap back.
      setShowToolActivity(show).catch((failure: Error) => {
        toastApi.post({
          title: show
            ? 'Could not show tool activity'
            : 'Could not hide tool activity',
          description: failure.message,
          status: 'danger',
          timeout: TOOL_ACTIVITY_TOAST_TIMEOUT_MS,
        });
      });
    },
    [captureReadingAnchor, setShowToolActivity, toastApi],
  );

  // The menu's Export session: the file is named after the agent, by its
  // technical name where an Agent matched and its display name otherwise.
  const exportSession = useExportSession({
    installation,
    sessionId,
    agentName: agent?.name ?? row?.agentName,
  });

  const actions = useMemo(
    () =>
      row ? (
        <SessionActionsMenu
          title={sessionTitle}
          deletion={deletion}
          onRename={openRename}
          isUserScoped={isUserScoped}
          runtimeLoss={runtimeLoss}
          pin={pin}
          notifications={notifications}
          onExport={exportSession}
        />
      ) : null,
    [
      row,
      sessionTitle,
      deletion,
      openRename,
      isUserScoped,
      runtimeLoss,
      pin,
      notifications,
      exportSession,
    ],
  );
  useProvidePageHeaderActions(actions);

  // The page scrolls the document, so that is what "to the bottom" means here.
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = document.scrollingElement ?? document.documentElement;
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Follow the reply as it streams in — but only when already reading the end.
  // Someone scrolled up through the history must not have the page yanked away
  // under them by every arriving token.
  // The turn's own event counter, not a size derived from its content: closing
  // a text run moves length out of `live` into `items`, which can leave any such
  // size unchanged across a real update and skip the follow for it.
  const streamTick = (send.stream ?? answerStream)?.revision ?? 0;
  useEffect(() => {
    if (streamTick === 0) {
      return;
    }
    const el = document.scrollingElement ?? document.documentElement;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [streamTick]);

  /**
   * The newest turn is active but has reported nothing for the age bound: the
   * observed failure of a turn that outlived its transport and never landed.
   * Not idle — kagent still holds the task and refuses a second message — so
   * the page keeps saying so and offers the cancel, rather than dropping to an
   * empty composer the next send would fail from.
   */
  const stalledSince =
    turnProgress?.kind === 'stalled' ? turnProgress.since : undefined;
  const isStalled = stalledSince !== undefined;

  /**
   * Whether to say the agent is working.
   *
   * Three signals, because none covers a whole turn on its own:
   *
   * - the conversation's own verdict (`isAgentWorking` — active, not waiting on a
   *   human, and moved recently), which only arrives once a poll has seen the new
   *   task, up to 10 s after sending;
   * - the in-flight send, which covers exactly that gap and cannot carry the rest:
   *   the gateway cuts the request off well before a long turn ends (60 s on a
   *   stock route), so it goes false mid-turn while the agent works on;
   * - the in-flight answer, for the same gap on the turn an answer resumes —
   *   but only once its stream has an event. Until then the question card is
   *   still up saying "Sending…", and a "Working…" row above it would report
   *   the same moment twice.
   *
   * A stalled turn overrides all three: a stream that has been open and silent
   * for the whole bound is the same symptom the poll measured, and "Working…"
   * next to "no progress since" would contradict itself.
   */
  const answerDispatched = Boolean(answerStream?.dispatched);
  const showWorking =
    !isStalled &&
    (send.isSending ||
      (confirmation.isAnswering && answerDispatched) ||
      agentIsWorking);

  /**
   * How the turn is being followed once its live stream ended before it did.
   *
   * A gateway's request timeout closes the stream mid-reply while the turn runs
   * on; "Working…" over text that stopped half-way promises a continuation that
   * is not coming through the stream. Instead the row says what is happening:
   * `checking` while the send is still re-reading the conversation, `following`
   * once that read has come back with the task still working — the preview is
   * gone for good and the poll delivers the reply. Nothing once the poll shows
   * the turn over (the stream hooks retire the loss themselves), so a finished
   * turn reads as finished with no reload. A stall keeps its own row.
   */
  const isStreamLost = send.isStreamLost || confirmation.isStreamLost;
  let streamLost: StreamLossPhase | undefined;
  if (isStreamLost && !isStalled) {
    if (send.isSending || confirmation.isAnswering) {
      streamLost = 'checking';
    } else if (agentIsWorking) {
      streamLost = 'following';
    }
  }

  /**
   * The turn a Stop or a Cancel would end: the one the stream named, else the
   * newest task the poll knows while it is still active. Undefined for the
   * first beat of a send, before either has — Stop is then withheld rather than
   * aimed at the previous turn.
   */
  const runningTaskId =
    send.stream?.taskId ??
    answerStream?.taskId ??
    (state?.isActive && (agentIsWorking || isStalled)
      ? currentTaskId
      : undefined);

  // The last message the user sent, put back into the composer after a stalled
  // turn is cancelled: that message was never processed, so "send again" is the
  // natural next step and the words should not have to be typed twice. Keyed on
  // the cancelled task so the composer restores it once per cancel, and cleared
  // when the composer takes it (see `SessionComposer`'s `restore`).
  const [redraft, setRedraft] = useState<{
    messageId: string;
    text: string;
    images?: ComposerImage[];
  } | null>(null);
  // With the images it carried, as the composer holds them, so a message
  // sent again or opened in a new session is the whole message.
  const lastUserMessage = useMemo(
    () => readLastUserMessage(conversationItems),
    [conversationItems],
  );

  /**
   * The way out of a lost runtime or an answer kagent did not take: a new
   * session with the same agent, titled `Continued: <title>`, whose first
   * message carries this conversation on (`buildContinuationPrompt`).
   *
   * Create, navigate, then send — the order every entry point keeps, see
   * "Starting a session" in docs/agent-platform.md. Carried through the router
   * state exactly as the list's composer carries a first message, so the new
   * page dispatches it on arrival — a different page instance, since
   * `SessionDetailRoute` keys the page on the session.
   */
  const creation = useCreateSession('sessionDetail');
  const navigate = useNavigate();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const { createSession } = creation;
  const startNewSession = useCallback(async () => {
    // The new session has none of this conversation, and an answer alone
    // answers nothing in it.
    if (!continuation) {
      return;
    }
    const { text, images } = continuation;
    // One prefix however many times a session is carried on.
    const title = `${CONTINUED_TITLE_PREFIX}${sessionTitle.replace(
      CONTINUED_TITLE_PATTERN,
      '',
    )}`;
    if (!agentRow) {
      return;
    }
    let newSessionId: string;
    try {
      newSessionId = await createSession({
        agent: agentRow,
        prompt: text,
        title,
      });
    } catch {
      // Left to the notice, which renders the hook's `error`.
      return;
    }
    const href = sessionDetailRoute?.({
      installation: agentRow.installation,
      sessionId: newSessionId,
    });
    if (!href) {
      return;
    }
    navigate(href, {
      state: {
        [NEW_SESSION_STATE_KEY]: {
          text,
          agentNamespace: agentRow.namespace,
          agentName: agentRow.technicalName,
          modelConfig: modelConfigNameOf(agentRow),
          imagesKey: stashHandoffImages(images),
        },
      },
    });
  }, [
    agentRow,
    createSession,
    navigate,
    sessionDetailRoute,
    continuation,
    sessionTitle,
  ]);

  const { cancelTask } = cancellation;
  const { reset: resetSend } = send;
  /**
   * Cancel a turn server-side. With `redraftLast`, the last message returns to
   * the composer once the cancel is through — for a stalled turn, whose message
   * never got an answer. A send refused with a 409 is also cleared: the turn it
   * conflicted with is gone.
   */
  const cancelTurn = useCallback(
    (taskId: string, redraftLast: boolean) => {
      const draft = lastUserMessage;
      cancelTask(taskId)
        .then(() => {
          resetSend();
          if (redraftLast && draft) {
            setRedraft({ messageId: `redraft:${taskId}`, ...draft });
          }
        })
        // Errors surface through the hook's `error`, shown beside the composer.
        .catch(() => {});
    },
    [cancelTask, lastUserMessage, resetSend],
  );
  const stopTurn = useMemo(() => {
    if (!runningTaskId) {
      return undefined;
    }
    return () => cancelTurn(runningTaskId, isStalled);
  }, [cancelTurn, runningTaskId, isStalled]);

  /**
   * A send kagent refused because the session is still working on the previous
   * turn (409). Rendered as its own explanation with the cancel beside it,
   * rather than as "Message not sent" over a composer the next attempt would
   * fail from just the same.
   */
  const isConflict = isConflictError(send.error);
  const cancelConflictingTurn = useMemo(() => {
    const taskId = state?.isActive ? currentTaskId : undefined;
    if (!taskId) {
      return undefined;
    }
    return () => cancelTurn(taskId, false);
  }, [cancelTurn, currentTaskId, state?.isActive]);

  /**
   * The session's state as this page shows it: the one source for the
   * header's badge, the composer and the rail (T100 H4).
   *
   * The polled state lags the page: a send is in flight before any poll has
   * seen its task, so the poll still reads "no activity" or the previous
   * turn's end while the body already says "Working…". `showWorking` is the
   * signal that row uses, so while it holds the state is Working, and nothing
   * on the page can contradict the body.
   *
   * A stalled turn is the other way round (R2-4): the poll still reads it as
   * working, while the body says it has not reported progress and offers
   * Stop. The state then says so too, as a warning, so the header never
   * claims Working beside a stalled row.
   */
  const shownState = useMemo<SessionState | undefined>(() => {
    if (showWorking) {
      return describeSessionState('working');
    }
    if (isStalled && state?.isActive) {
      return { ...state, label: STALLED_STATE_LABEL, tone: 'warning' };
    }
    return state;
  }, [showWorking, isStalled, state]);

  // The conversation column and the chat bar docked at its end, held as state
  // through callback refs: both exist only on the loaded path (and the dock
  // only while a composer is offered), and the layout hook re-measures when
  // either comes or goes.
  const [columnElement, setColumnElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [dockElement, setDockElement] = useState<HTMLDivElement | null>(null);
  useDockedComposerLayout(columnElement, dockElement);

  // A session opens at its newest turn, the way a desktop chat app does (live
  // round 2, R8: a long session opened at its top). Once per session, when its
  // conversation first renders — the column exists only then. Later scrolling
  // is the reader's: "Show earlier activity" adds turns above without coming
  // back here, and the follow above only moves a reader already at the end.
  // Before paint, so the top never flashes; and once more a frame later, for
  // layout that lands after the first (the dock's measured min-height).
  const openedAtEndFor = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (!columnElement || openedAtEndFor.current === sessionId) {
      return undefined;
    }
    openedAtEndFor.current = sessionId;
    const el = document.scrollingElement ?? document.documentElement;
    el.scrollTop = el.scrollHeight;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [columnElement, sessionId]);

  // The loaded page's header from the first paint, with skeletons where the
  // read will fill in: the title and the badge row (T95).
  if (isLoading) {
    return (
      <Shell
        title={<ShellPageTitleSkeleton label="Loading session" />}
        badges={<ShellPageBadgeSkeleton />}
      >
        <LoadingIndicator label="Reading the session…" />
      </Shell>
    );
  }

  if (isNotFound) {
    return (
      <Shell>
        <EmptyStateCard
          title="Session not found"
          description={`No session with this id on ${
            installation || 'that environment'
          }. It may have been deleted, or be someone else's — kagent shows only your own.`}
          actions={<BackToSessions>Back to sessions</BackToSessions>}
        />
      </Shell>
    );
  }

  // Deliberately not `error ||`: these reads poll, and react-query keeps `data`
  // while setting `error` on a failed *refetch* — which the query client does not
  // retry for ServiceUnavailable/Unauthorized/Forbidden. Treating any error as
  // fatal would let one proxy hiccup replace a rendered conversation with an
  // alert until the next successful poll. With both reads in hand the page renders
  // whatever the last one did, and says so in the notice below.
  //
  // `hasConversation` is not redundant with `!detail`. The two reads fail
  // independently, and a tasks read that fails on *first* load leaves the timeline,
  // turn count and token stats at their zero values while the session read
  // succeeds — which would render "no activity", `Turns 0` and "no messages yet"
  // over a session that has a full conversation. Absent is not empty.
  if (!detail || !row || !hasConversation) {
    return (
      <Shell>
        <Flex direction="column" gap="3">
          <Alert
            status="danger"
            title="Could not load this session"
            description={
              error?.message ??
              'kagent sent an unreadable response. The session may still exist.'
            }
          />
          <BackToSessions>Back to sessions</BackToSessions>
        </Flex>
      </Shell>
    );
  }

  /* Cost and context, per the prototype: one chip in the composer's own
     controls, so it stays on screen with the docked box however long the
     conversation gets. Estimated cost is labeled as one and names its basis;
     reported cost appears only when the runtime reported any; context is a
     share only when the model's context window is configured. The details
     popover opens above the chip. */
  const costChip = (
    <SessionCostPopover
      installation={row.installation}
      model={row.agentModel}
      tokens={timeline.tokens}
      context={timeline.context}
      taskCount={taskCount}
      estimatedCostUsd={estimatedCostUsd}
      costBasis={describeCostBasis({
        tier: rateTier,
        model: row.agentModel,
        installation: row.installation,
        window: rateWindow,
        inputTokens: timeline.tokens.prompt,
        outputTokens: timeline.tokens.completion,
        unpricedTokens:
          timeline.tokens.total -
          timeline.tokens.prompt -
          timeline.tokens.completion,
      })}
    />
  );

  /**
   * Why the composer is not offered, when it is not.
   *
   * Each case withholds the control and says so, rather than showing one that
   * fails on use — and each is a different thing the user can act on.
   */
  let composerWithheldReason: string | undefined;
  if (detail.readOnly) {
    composerWithheldReason =
      'This session was shared read-only, so you cannot add to it.';
  } else if (!agent) {
    composerWithheldReason = row.agentName
      ? `The agent “${row.agentName}” could not be found on ${installation}, so there is nowhere to send a message.`
      : 'This session records no agent to send a message to.';
  } else if (
    state &&
    AWAITING_INPUT_STATES.has(state.key) &&
    !runtimeLoss?.reported
  ) {
    // Withheld deliberately, and it is the opposite of "busy": the agent asked
    // something and nothing moves until it is answered. A plain message here does
    // not answer it — kagent opens a *new* task and leaves the question pending
    // forever — so the composer is disabled under the question card attached
    // to it, which resumes the suspended task instead.
    //
    // This reason is only reached when the confirmation itself could not be read:
    // a shape we do not recognise, or a task with no id to resume. Answering then
    // would be guessing at what the agent asked.
    composerWithheldReason = pendingConfirmation
      ? undefined
      : 'The agent is waiting for you, but its request could not be read. Reply in the kagent UI.';
  }

  /**
   * What sits below the conversation: a withheld-composer note, or the docked
   * chat bar — the composer, with a question card attached while one waits.
   *
   * Assembled here rather than as a ternary chain in the JSX — there are three
   * outcomes and two of them are multi-element.
   */
  let bottomControl: ReactNode;
  if (composerWithheldReason) {
    // The chip keeps the session's totals in reach even where there is no box
    // to carry it — a read-only share still has a cost worth seeing.
    bottomControl = (
      <Flex align="center" justify="between" gap="2">
        <Text variant="body-small" color="secondary">
          {composerWithheldReason}
        </Text>
        {costChip}
      </Flex>
    );
  } else {
    // The composer — and, while the agent is waiting on an answer, the question
    // card attached to it with the box disabled (T40: the chat bar is where the
    // agent's question is answered, as in a chat app; the timeline keeps the
    // record of what was asked and answered). A plain message cannot answer a
    // confirmation — it opens a new task and strands this one — so the composer
    // must not submit then. But removing it outright reads as the reply feature
    // being missing rather than blocked, so it stays in place saying why. kagent's
    // own UI makes the same call, leaving its box on screen with
    // `Awaiting approval…` in it.
    //
    // One element, one composer, whether or not the card is there: the card is
    // the composer's attachment or nothing, so the composer keeps its position
    // and React keeps its instance. That is what lets the composer notice the
    // card going away and take the focus back (see `SessionComposer`); as two
    // branches with different wrappers it remounted, and the focus fell to
    // <body> after every answered question. The dock stays docked throughout.
    //
    // The card goes as soon as the answer's stream has its first event: kagent
    // has taken the answer and the task is no longer waiting, whatever the poll
    // — up to 10 s behind — still says. Until the next poll the composer below
    // stands in with "working", which is what the stream says is happening.
    //
    // Not while kagent has reported the runtime lost, nor once it did not take
    // an answer: another answer would go the same way, so the question is left
    // where it is and the notice, with the way out, takes the card's place.
    const isConfirming =
      Boolean(pendingConfirmation && agent) &&
      !answerDispatched &&
      !cannotContinue;
    // The way out, offered in the notice that explains it: beside the retry
    // while the loss is only suspected, the only way on once kagent has
    // reported it or did not take an answer. Needs the agent
    // as a row to create against; without one the notice says where else to go.
    // Withheld where agent-manager cannot start a session as the person (the
    // notice gives the row's `sessionBlocker`), and while that is still read.
    const offersNewSession = Boolean(
      (runtimeLoss || answerNotTaken) &&
      agentRow &&
      !agentRow.sessionBlocker &&
      !agentRow.isSessionPending &&
      !isConfirming,
    );
    // The prototype's waiting caption, naming who waits on what and pointing
    // at the card attached just above the box. The box is disabled meanwhile,
    // because a plain message cannot answer the card: it would open a new
    // turn.
    let composerDisabledReason: string | undefined;
    if (isConfirming) {
      composerDisabledReason = `${row.agentName || 'The agent'} is waiting for your ${
        pendingConfirmation?.asks === 'input'
          ? 'answer above.'
          : 'decision above.'
      }`;
    } else if (chatGpt.blocksTurn) {
      // The agent runs on the person's own ChatGPT subscription, which they
      // have not connected: the prompt above the box is the way on.
      composerDisabledReason = CHATGPT_CONNECT_REASON;
    }
    const chatGptPrompt = chatGpt.blocksTurn ? (
      <ChatGptConnectPrompt
        hasHeldMessage={chatGptHoldsHandoff}
        onConnect={() => setChatGptDialogOpen(true)}
      />
    ) : undefined;
    const newSession = offersNewSession
      ? {
          onStart: () => {
            // Errors surface through the create hook's `error`, which the
            // notice renders.
            startNewSession().catch(() => {});
          },
          isStarting: creation.isCreating,
        }
      : undefined;
    bottomControl = (
      <div
        ref={setDockElement}
        className={classes.bottomDock}
        data-testid="session-dock"
      >
        <ChatGptConnectDialog
          installation={installation}
          isOpen={isChatGptDialogOpen}
          onOpenChange={setChatGptDialogOpen}
        />
        {runtimeLoss && (runtimeLoss.reported || !answerNotTaken) && (
          <RuntimeLostNotice
            loss={runtimeLoss}
            agentName={row.agentName || undefined}
            newSession={newSession}
            newSessionBlocker={agentRow?.sessionBlocker}
            hasQuestion={Boolean(pendingConfirmation?.questions.length)}
            // Not while the question card is up: it holds the answer itself.
            answer={isConfirming ? undefined : failedAnswerText}
            continuation={continuation}
            startError={creation.error?.message}
          />
        )}
        {/* Over a merely suspected loss too, whose retry this case rules out. */}
        {answerNotTaken && !runtimeLoss?.reported && (
          <AnswerNotTakenNotice
            agentName={row.agentName || undefined}
            newSession={newSession}
            newSessionBlocker={agentRow?.sessionBlocker}
            answer={failedAnswerText}
            continuation={continuation}
            startError={creation.error?.message}
          />
        )}
        {isConflict && (
          <Alert
            status="warning"
            title="This session is still working on the previous turn"
            description="kagent takes one message per session at a time. Wait for the turn to finish, or stop it and send again."
            customActions={
              cancelConflictingTurn ? (
                <Button
                  size="small"
                  variant="secondary"
                  isPending={cancellation.isCancelling}
                  onPress={cancelConflictingTurn}
                >
                  Stop the turn
                </Button>
              ) : undefined
            }
          />
        )}
        {/* A session that cannot go on takes no more messages, so it shows no
            box: the notice above is the way on. The chip keeps the session's
            totals in reach without one. */}
        {cannotContinue ? (
          <Flex justify="end">{costChip}</Flex>
        ) : (
          <SessionComposer
            attachment={
              isConfirming ? (
                <PendingConfirmationPanel
                  pending={pendingConfirmation!}
                  agentName={row.agentName || undefined}
                  connectorOf={connectorOf}
                  isAnswering={confirmation.isAnswering}
                  error={confirmation.error?.message}
                  restore={confirmation.failed}
                  isUserScoped={isUserScoped}
                  onAnswer={answer => {
                    // Errors surface through the hook's `error`, which the card
                    // renders above the choices it hands back. The request it
                    // answers goes along, so a not-taken verdict is tied to it.
                    confirmation
                      .answer({
                        ...answer,
                        ...(pendingConfirmation?.askedIn && {
                          askedIn: pendingConfirmation.askedIn,
                        }),
                      })
                      .catch(() => {});
                  }}
                />
              ) : (
                chatGptPrompt
              )
            }
            // Waiting on an answer is the opposite of busy; the caption is the
            // reason below either way. A stalled turn still withholds Send —
            // kagent would refuse the message — but says so instead of promising
            // a reply.
            isAgentWorking={isConfirming ? false : showWorking || isStalled}
            isStalled={isStalled}
            isFinished={Boolean(shownState && !shownState.isActive)}
            agentName={row.agentName || undefined}
            disabledReason={composerDisabledReason}
            // A conflict has its own notice above; the composer must not also
            // report it as a generic failure. Nor must a lost runtime: the
            // notice carries the runtime's words as its evidence.
            error={isConflict || runtimeLoss ? undefined : send.error?.message}
            // A failed Stop is reported as one, not as a message that was not
            // sent — the turn it aimed at is still running.
            stopError={describeStopFailure(cancellation.error)}
            // On failure the optimistic copy is dropped, so this is the only place the
            // user's text still exists. After a stalled turn was cancelled, the
            // message it never answered comes back the same way.
            restore={send.failed ?? redraft}
            onStop={isConfirming ? undefined : stopTurn}
            isStopping={cancellation.isCancelling}
            details={costChip}
            // The user arrived here by starting the session — typing in a composer
            // one screen ago — and the navigation dropped the focus. Restoring it to
            // the box is continuity, the one case the a11y rule does not have in mind;
            // a session merely opened from the list gets no autofocus.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={Boolean(handoff)}
            images={composerImages}
            onSubmit={(text, images) => {
              // Errors are surfaced through the hook's `error`, which the composer
              // renders beside the text it hands back.
              send.sendMessage(text, images).catch(() => {});
              // The optimistic echo appears at the very bottom; go where it is.
              scrollToBottom();
            }}
          />
        )}
      </div>
    );
  }

  const avatarUrl = row.agentTechnicalName
    ? buildAvatarUrl(row.installation, row.agentTechnicalName, {
        size: AVATAR_SIZE,
      })
    : undefined;

  // Undefined when no `Agent` CR matched the session — `row.agentName` is then a
  // lossy decode of the encoded `agent_id` and names nothing that can be looked
  // up — or when the route is not bound. The name stays plain text in both cases.
  const agentHref =
    agent && agentDetailRoute
      ? agentDetailRoute({
          installation: row.installation,
          namespace: agent.namespace,
          name: agent.name,
        })
      : undefined;

  /* The header's parts, placed by the frame: the `ShellPage` header's title,
     badges and meta — the same scale and position every platform page uses. */

  /* The underline on hover says "this does something"; it does not say what.
     Everything else up here is inert text, so without a label the affordance is
     only findable by clicking a heading on the off chance — which nobody does.

     A real <button>, stripped of its chrome, rather than a click handler on
     the heading: the title is an editing affordance, and only a button is
     reachable by keyboard and announced as actionable. Everything visual is
     inherited from `ShellPage`'s h1, so it still reads as the heading it
     replaces.

     A native `title` rather than a tooltip component, as `DateComponent`
     does: bui's wraps react-aria's `TooltipTrigger`, which only wires up its
     own focusable components (this trigger is a bare <button> so it can
     inherit the heading's typography), and MUI's calls `findDOMNode` on its
     child, which React 18.3 warns about. */
  const titleButton = (
    <button
      type="button"
      className={classes.titleButton}
      onClick={openRename}
      // The accessible name has to say what pressing this does, since the
      // visible text is the session's name and says nothing about renaming.
      // The title is the sighted equivalent of this.
      aria-label={`Rename session "${sessionTitle}"`}
      title="Rename session"
    >
      {/* Bare text, so the button inherits ShellPage's h1 typography — the
          platform-standard title scale. */}
      {sessionTitle}
    </button>
  );

  /* The raw A2A state is kept as the label for anything we don't recognise, so
     a future kagent state shows as itself. The runtime-lost mark is the same
     one the list and the rail carry; only kagent's own word earns it. */
  const stateBadges = (
    <>
      {/* The dot and word the sessions list and the rail draw (T98). */}
      {shownState ? (
        <StatusDot
          tone={shownState.tone}
          label={shownState.label}
          colorVar={sessionStateDotVar(shownState.tone)}
        />
      ) : (
        <StatusDot
          tone="neutral"
          label={STATE_IDLE_LABEL}
          colorVar={sessionStateDotVar('neutral')}
        />
      )}
      {runtimeLoss?.reported && (
        <Badge size="small" title={RUNTIME_LOST_TITLE}>
          {RUNTIME_LOST_LABEL}
        </Badge>
      )}
    </>
  );

  const agentLink = row.agentName && (
    <Flex align="center" gap="2">
      <AgentAvatar
        size="small"
        purpose="decoration"
        name={row.agentName}
        src={avatarUrl ?? ''}
      />
      {/* core-components' `Link`, which routes client-side — a bui
          link would reload the page. */}
      {agentHref ? (
        <Link to={agentHref}>
          {/* bui `Text` sets its own colour, which would leave a
              link that doesn't look like one; `inherit` hands it back
              to the anchor. `as="span"`: Text renders a <p> by
              default. */}
          <Text as="span" variant="body-medium" style={{ color: 'inherit' }}>
            {row.agentName}
          </Text>
        </Link>
      ) : (
        <Text variant="body-medium">{row.agentName}</Text>
      )}
    </Flex>
  );

  const environment = (
    <Flex align="center" gap="1">
      <Text variant="body-medium" color="secondary">
        on
      </Text>
      <InstallationChip installation={row.installation} />
    </Flex>
  );

  /* The workspace the session works in, beside the agent: what its
     directory holds and how fresh it is. Nothing for a session without one,
     so that header reads as before. */
  const workspaceChip = row.workspace && workspaceName && (
    <SessionWorkspaceChip
      sessionId={row.sessionId}
      installation={row.installation}
      workspace={row.workspace}
      name={workspaceName}
    />
  );

  /* Absolute, not relative: the list keeps the relative form, where scanning
     for recency is the point. No last activity and no duration: kagent API v2
     does not move `updated_at` on a turn, so both would only restate the start
     (kagent-dev/kagent#2397). */
  const startedMeta = (
    <Text variant="body-small" color="secondary">
      Started {row.createdAt ? <DateComponent value={row.createdAt} /> : '—'}
    </Text>
  );

  /* A view preference for the conversation below, so it sits on the line
     that describes the session rather than among the actions on it (PO), at
     the line's text size. Rendered here rather than through ShellPage's
     `meta`, which wraps its content in text the switch's label cannot nest
     in. Held until the stored choice is read, like the conversation, so it
     never shows a state it is about to flip from. */
  const toolActivitySwitch = isToolActivityKnown && (
    <Switch
      label="Show tool activity"
      isSelected={showToolActivity}
      onChange={changeToolActivity}
      className={classes.toolActivitySwitch}
    />
  );

  return (
    <Shell
      title={titleButton}
      documentTitle={row.title}
      badges={
        <>
          {stateBadges}
          {agentLink}
          {workspaceChip}
          {/* The header once it has scrolled away (ShellPage's
              `compactHeader`) keeps the name, the state, the agent, the
              switch, the pin and the menu in sight while reading. Where the
              session runs and when it started are read once, not while
              reading. At phone width the switch is left out too: beside the
              state and the agent it wraps the compact row to a third line
              over the conversation. */}
          <ShellPageExpandedOnly>
            {environment}
            {startedMeta}
          </ShellPageExpandedOnly>
          {toolActivitySwitch && (
            <ShellPageExpandedOnly onlyAtPhoneWidth>
              {toolActivitySwitch}
            </ShellPageExpandedOnly>
          )}
        </>
      }
      compactHeader
    >
      <Flex
        ref={setColumnElement}
        direction="column"
        gap="4"
        className={classes.column}
      >
        {/* A refresh that failed after the page had loaded. Shown rather than
            thrown: the conversation on screen is still real, it has just stopped
            keeping up, and the user needs to know which of the two it is. */}
        {error && (
          <Alert
            status="warning"
            title="This session may be out of date"
            description={`The last refresh failed: ${error.message}`}
          />
        )}

        {continuedFrom && <ContinuedSessionBanner continues={continuedFrom} />}

        {/* Held until the stored "Show tool activity" choice is read, so a
            person who hides the work never sees it appear and vanish. */}
        {!isToolActivityKnown ? (
          <LoadingIndicator label="Reading the session…" />
        ) : (
          <SessionTimeline
            timeline={shownTimeline}
            agentName={row.agentName}
            agentEgressHref={agentEgressHref}
            agentAvatarUrl={avatarUrl}
            isAgentWorking={showWorking}
            streamLost={streamLost}
            stalledSince={stalledSince}
            onCancelTurn={isStalled ? stopTurn : undefined}
            isCancellingTurn={cancellation.isCancelling}
            // A hand-off's opener was written by the portal, not the person
            // (UX review M20). Known only from the router state of the arrival:
            // kagent stores no such flag, so a later visit shows it plain.
            firstMessageCaption={
              handoff?.prepared ? 'Prepared by the portal' : undefined
            }
            connectorOf={connectorOf}
            showToolActivity={showToolActivity}
            isAwaitingPerson={Boolean(
              state && AWAITING_INPUT_STATES.has(state.key),
            )}
          />
        )}

        {bottomControl}
      </Flex>

      {/* One dialog for both entry points, rendered here rather than inside the
          menu — react-aria unmounts the menu on selection, and the title could not
          reach it there anyway. */}
      <SessionRenameDialog
        title={sessionTitle}
        isOpen={isRenameOpen}
        onOpenChange={setRenameOpen}
        isRenaming={rename.isRenaming}
        error={rename.error?.message}
        onConfirm={async name => {
          try {
            await rename.renameSession(name);
          } catch {
            // Left to the dialog, which stays open and renders the hook's `error`.
            return;
          }
          setRenameOpen(false);
        }}
        isUserScoped={isUserScoped}
      />
    </Shell>
  );
}
