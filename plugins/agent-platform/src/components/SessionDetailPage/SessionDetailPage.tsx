import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Content,
  EmptyState,
  Link,
  Progress,
} from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Badge, Box, Button, Flex, Text } from '@backstage/ui';
import {
  makeStyles,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@material-ui/core';
import {
  DateComponent,
  Stat,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';

import { isConflictError, isUnauthorizedError } from '../../apis';
import { useCancelTask } from '../../hooks/useCancelTask';
import { useCreateSession } from '../../hooks/useCreateSession';
import { useDeleteSession } from '../../hooks/useDeleteSession';
import { useKagentCapabilities } from '../../hooks/useKagentCapabilities';
import { useAnswerConfirmation } from '../../hooks/useAnswerConfirmation';
import {
  NEW_SESSION_STATE_KEY,
  useNewSessionHandoff,
} from '../../hooks/useNewSessionHandoff';
import { useRenameSession } from '../../hooks/useRenameSession';
import { useSendMessage } from '../../hooks/useSendMessage';
import { useSessionDetail } from '../../hooks/useSessionDetail';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { useAgentIndex } from '../../hooks/useAgentIndex';
import { AvatarSize } from '../../lib/agentAvatar';
import {
  AWAITING_INPUT_STATES,
  isRuntimeLostFailureText,
  RuntimeLoss,
  SessionStateEntry,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  agentDetailRouteRef,
  sessionDetailRouteRef,
  sessionsRouteRef,
} from '../../routes';
import { InstallationChip } from '../InstallationChip';
import { PendingConfirmationPanel } from '../PendingConfirmationPanel';
import { SessionComposer } from '../SessionComposer';
import { SessionSwitcherRail } from '../SessionSwitcherRail';
import { RUNTIME_LOST_LABEL, RUNTIME_LOST_TITLE } from '../SessionsTable';
import { RuntimeLostNotice } from './RuntimeLostNotice';
import { SessionActionsMenu } from './SessionActionsMenu';
import { SessionRenameDialog } from './SessionRenameDialog';
import {
  SESSION_TITLE_FALLBACK,
  toSessionRow,
} from '../SessionsDataProvider/helpers';
import {
  formatTokens,
  SessionTimeline,
  StreamLossPhase,
} from '../SessionTimeline';
import { estimateCost } from '../../lib/costEstimate';
import { describeCostBasis } from '../../lib/costBasis';
import { formatUsd } from '../../lib/formatNumbers';
import { useTokenRates } from '../../hooks/useTokenRates';
import { AgentAvatar } from '../AgentAvatar';

/** Matches the list's row avatar: one line of text, 2× for hi-dpi. */
const AVATAR_SIZE: AvatarSize = 48;

const useStyles = makeStyles(theme => ({
  // Rail beside content. `alignItems` must stay at its `stretch` default — a
  // `flex-start` here would content-size the rail and stop it sticking past its
  // own height, which is the bug that makes a sticky flex child look broken.
  page: {
    display: 'flex',
    gap: theme.spacing(3),
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  // One readable column, like any chat surface: full-bleed prose is hard to
  // scan, and the conversation is what this page is for.
  column: {
    width: '100%',
    maxWidth: 920,
    margin: '0 auto',
  },
  // The composer stays reachable however long the conversation gets. Only the
  // composer docks: a pending confirmation panel can be tall, and pinning it
  // would cover the very conversation it asks about. The gap is what keeps
  // whatever shares the dock — a lost-runtime notice, a rejected send — off the
  // composer's box; neither bui's Alert nor the composer's form has a margin.
  bottomDock: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    position: 'sticky',
    bottom: 0,
    zIndex: 1,
    backgroundColor: `var(--bui-bg-app, ${theme.palette.background.default})`,
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(2),
    marginBottom: theme.spacing(-2),
  },
  // The same slot while a confirmation is open: the panel stacked above the
  // composer, and nothing pinned. Kept as one element with `bottomDock` (the
  // class changes, the element does not) so the composer inside survives the
  // panel coming and going — see the `bottomControl` assembly.
  bottomStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
  },
  stats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(2, 5),
    paddingTop: theme.spacing(1.5),
    paddingBottom: theme.spacing(1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
    borderBottom: `1px solid ${theme.palette.divider}`,
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
 * The page's outer frame: the switcher rail, then the conversation column.
 *
 * A separate component so every one of the page's exits gets it — loading,
 * not-found, unreadable, and the real thing. A session that has been deleted is
 * *precisely* when the switcher is wanted, and a rail that vanished on the error
 * states would strand the reader on a dead page with only the back link.
 *
 * The rail is not rendered below `sm`, rather than hidden with CSS, so a narrow
 * viewport does not pay for its two queries and their polling.
 */
function Shell({
  installation,
  sessionId,
  currentSessionState,
  children,
}: {
  installation: string;
  sessionId: string;
  /** Only the loaded path knows this; the early returns leave it undefined. */
  currentSessionState?: SessionStateEntry;
  children: ReactNode;
}) {
  const classes = useStyles();
  const theme = useTheme();
  const showRail = useMediaQuery(theme.breakpoints.up('sm'));

  return (
    <Content className={classes.page}>
      {showRail && (
        <SessionSwitcherRail
          installation={installation}
          currentSessionId={sessionId}
          currentSessionState={currentSessionState}
        />
      )}
      <div className={classes.main}>{children}</div>
    </Content>
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
    return `${error.message}. Your sign-in expired while this page was open — reload the page and stop the turn again.`;
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
 * cost, tokens-per-second, context-window usage, the owning team, the trigger that
 * started the session, a linked work item, produced results, and evaluation. Please
 * don't re-add them speculatively — there is no data behind them.
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

  const {
    detail,
    timeline,
    state,
    currentTaskId,
    stateChangedAt,
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
  });
  const cancellation = useCancelTask(installation, sessionId);

  // The same join the list uses, so a session's agent is named identically in both
  // places — and falls back to the same lossy decode when no Agent CR matched.
  const agentIndex = useAgentIndex();

  const row = useMemo(
    () => (detail ? toSessionRow(detail.session, agentIndex) : undefined),
    [detail, agentIndex],
  );

  // `useDeleteSession`, `useRenameSession` and `useKagentCapabilities` are all called
  // here rather than inside the menu: the menu is rendered in the shared plugin
  // header, which is outside this plugin's `QueryClientProvider`, so a mutation or a
  // query has no client there. The capabilities probe is a cached `/me` read with an
  // hour's staleTime, so asking for it on this page is free.
  const rename = useRenameSession(installation, sessionId);

  // The prompt this session was started with, if the user arrived here by
  // starting it. Read once and cleared, so returning to the session later cannot
  // re-send it. See `useNewSessionHandoff`.
  const handoff = useNewSessionHandoff();

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
    dispatched.current = true;
    // Errors surface through `send.error` and `send.failed`, exactly as they do
    // for a reply typed into the composer — which is also what hands the text
    // back so it is not lost.
    sendMessage(handoff.text).catch(() => {});
  }, [handoff, sendMessage]);

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
  // has already delivered is dropped by recognition — exactly like the stand-in —
  // and the whole preview is discarded once the send's awaited invalidation has
  // put the canonical history on screen (`useSendMessage` clears `stream` then).
  //
  // An answer to a confirmation streams the resumed turn the same way, through
  // the same reducer, so its preview merges through this one path. At most one
  // of the two is in flight: the answer panel replaces the composer while a
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
    }

    if (streamVisible) {
      const polled = new Set(
        timeline.items.map(item => item.messageId).filter(Boolean),
      );
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
        if (item.messageId && polled.has(item.messageId)) {
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
      if (
        live &&
        live.text.trim() &&
        !(live.messageId && polled.has(live.messageId))
      ) {
        items.push({
          kind: live.kind,
          id: 'stream:live',
          taskIndex,
          messageId: live.messageId,
          author: live.author,
          text: live.text.trim(),
        });
      }
    }

    return { ...timeline, items };
  }, [timeline, send.pending, send.stream, answerStream]);

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
  const actions = useMemo(
    () =>
      row ? (
        <SessionActionsMenu
          title={sessionTitle}
          deletion={deletion}
          onRename={openRename}
          isUserScoped={isUserScoped}
          runtimeLoss={runtimeLoss}
        />
      ) : null,
    [row, sessionTitle, deletion, openRename, isUserScoped, runtimeLoss],
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
   *   but only once its stream has an event. Until then the answer panel is
   *   still up saying "Sending…", and a "Working…" row under it would report
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
  } | null>(null);
  const lastUserMessageText = useMemo(() => {
    for (let index = timeline.items.length - 1; index >= 0; index -= 1) {
      const item = timeline.items[index];
      if (item.kind === 'user-message') {
        return item.text;
      }
    }
    return undefined;
  }, [timeline.items]);

  /**
   * The way out of a lost runtime: a new session with the same agent, opened
   * on the message that never got its answer.
   *
   * Create, navigate, then send — the order every entry point keeps, see
   * "Starting a session" in docs/agent-platform.md. The text is what the box
   * holds, else the message that failed (handed back by the send), else the
   * last message the person sent into this session: the one the runtime never
   * read. Carried through the router state exactly as the list's composer
   * carries a first message, so the new page dispatches it on arrival — a
   * different page instance, since `SessionDetailRoute` keys the page on the
   * session.
   */
  const creation = useCreateSession();
  const navigate = useNavigate();
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const { createSession } = creation;
  const unansweredText = send.failed?.text ?? lastUserMessageText;
  const startNewSession = useCallback(
    async (draft: string) => {
      const text = draft.trim() || unansweredText;
      if (!agentRow || !text) {
        return;
      }
      let newSessionId: string;
      try {
        newSessionId = await createSession({ agent: agentRow, prompt: text });
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
          },
        },
      });
    },
    [agentRow, createSession, navigate, sessionDetailRoute, unansweredText],
  );

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
      const draft = lastUserMessageText;
      cancelTask(taskId)
        .then(() => {
          resetSend();
          if (redraftLast && draft) {
            setRedraft({ messageId: `redraft:${taskId}`, text: draft });
          }
        })
        // Errors surface through the hook's `error`, shown beside the composer.
        .catch(() => {});
    },
    [cancelTask, lastUserMessageText, resetSend],
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
   * What the rail should believe about *this* session.
   *
   * The rail's own source is a summary the backend caches for 15 s, so it is
   * structurally behind this page — which polls the session's tasks directly and
   * additionally knows about a send still in flight. Left to the summary, a
   * message appended to a finished session would leave it filed under "Recently
   * finished" while the agent is visibly working beside it.
   *
   * `showWorking` is the same signal the "Working…" indicator uses, so the rail
   * and the page cannot disagree about whether the agent is busy. When nothing
   * is in flight this still overrides, with the state and timestamp read from
   * the same task — a fresher copy of what the summary would eventually say.
   */
  const currentSessionState = useMemo<SessionStateEntry | undefined>(() => {
    if (showWorking) {
      return { sessionId, state: 'working', changedAt: Date.now() };
    }
    if (!state) {
      return undefined;
    }
    return {
      sessionId,
      state: state.raw,
      ...(stateChangedAt === undefined ? {} : { changedAt: stateChangedAt }),
    };
  }, [showWorking, sessionId, state, stateChangedAt]);

  if (isLoading) {
    return (
      <Shell installation={installation} sessionId={sessionId}>
        <Progress aria-label="Loading session" />
      </Shell>
    );
  }

  if (isNotFound) {
    return (
      <Shell installation={installation} sessionId={sessionId}>
        <EmptyState
          missing="data"
          title="Session not found"
          description={`No session with this id exists on ${
            installation || 'that installation'
          }. It may have been deleted, or belong to another user — kagent only lets you read your own sessions.`}
          action={<BackToSessions>Back to sessions</BackToSessions>}
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
      <Shell installation={installation} sessionId={sessionId}>
        <Flex direction="column" gap="3">
          <Alert
            status="danger"
            title="Could not load this session"
            description={
              error?.message ??
              'kagent returned a response we could not read. The session may still exist.'
            }
          />
          <BackToSessions>Back to sessions</BackToSessions>
        </Flex>
      </Shell>
    );
  }

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
      ? `The agent “${row.agentName}” could not be found on ${installation}, so there is nowhere to send a message. It may have been deleted.`
      : 'This session records no agent, so there is nowhere to send a message.';
  } else if (
    state &&
    AWAITING_INPUT_STATES.has(state.key) &&
    !runtimeLoss?.reported
  ) {
    // Withheld deliberately, and it is the opposite of "busy": the agent asked
    // something and nothing moves until it is answered. A plain message here does
    // not answer it — kagent opens a *new* task and leaves the question pending
    // forever — so the composer is replaced by the answer panel below, which
    // resumes the suspended task instead.
    //
    // This reason is only reached when the confirmation itself could not be read:
    // a shape we do not recognise, or a task with no id to resume. Answering then
    // would be guessing at what the agent asked.
    composerWithheldReason = pendingConfirmation
      ? undefined
      : 'This session is waiting for input, but the request could not be read — use the kagent UI to reply.';
  }

  /**
   * What sits below the conversation: nothing, an answer panel, or the composer.
   *
   * Assembled here rather than as a ternary chain in the JSX — there are three
   * outcomes and two of them are multi-element.
   */
  let bottomControl: ReactNode;
  if (composerWithheldReason) {
    bottomControl = (
      <Text variant="body-small" color="secondary">
        {composerWithheldReason}
      </Text>
    );
  } else {
    // The composer — and, while the agent is waiting on an answer, the panel
    // above it with the composer disabled. A plain message cannot answer a
    // confirmation — it opens a new task and strands this one — so the composer
    // must not submit then. But removing it outright reads as the reply feature
    // being missing rather than blocked, so it stays in place saying why. kagent's
    // own UI makes the same call, leaving its box on screen with
    // `Awaiting approval…` in it.
    //
    // One element, one composer, whether or not the panel is there: the panel is
    // the first child or nothing, so the composer keeps its position and React
    // keeps its instance. That is what lets the composer notice the panel going
    // away and take the focus back (see `SessionComposer`); as two branches with
    // different wrappers it remounted, and the focus fell to <body> after every
    // answered question. The wrapper's class still differs — the panel can be
    // tall, and pinning it would cover the very conversation it asks about — but
    // a class is not an identity.
    //
    // The panel goes as soon as the answer's stream has its first event: kagent
    // has taken the answer and the task is no longer waiting, whatever the poll
    // — up to 10 s behind — still says. Until the next poll the composer below
    // stands in with "working", which is what the stream says is happening.
    //
    // Not while kagent has reported the runtime lost: an answer would run into
    // the same lost runtime, so the question is left where it is and the way
    // out takes the panel's place.
    const isConfirming =
      Boolean(pendingConfirmation && agent) &&
      !answerDispatched &&
      !runtimeLoss?.reported;
    // The way out, offered under the box: a second button while the loss is
    // only suspected, the only one once kagent has reported it. Needs the agent
    // as a row to create against; without one the notice says where else to go.
    const offersNewSession = Boolean(runtimeLoss && agentRow && !isConfirming);
    bottomControl = (
      <div className={isConfirming ? classes.bottomStack : classes.bottomDock}>
        {runtimeLoss && (
          <RuntimeLostNotice
            loss={runtimeLoss}
            agentName={row.agentName || undefined}
            offersNewSession={offersNewSession}
            startError={creation.error?.message}
          />
        )}
        {isConflict && (
          <Alert
            status="warning"
            title="This session is still working on the previous turn"
            description="kagent takes one message per session at a time. Wait for that turn to finish, or cancel it and send your message again."
            customActions={
              cancelConflictingTurn ? (
                <Button
                  size="small"
                  variant="secondary"
                  isPending={cancellation.isCancelling}
                  onPress={cancelConflictingTurn}
                >
                  Cancel the turn
                </Button>
              ) : undefined
            }
          />
        )}
        {isConfirming && (
          <PendingConfirmationPanel
            pending={pendingConfirmation!}
            isAnswering={confirmation.isAnswering}
            error={confirmation.error?.message}
            restore={confirmation.failed}
            isUserScoped={isUserScoped}
            onAnswer={answer => {
              // Errors surface through the hook's `error`, which the panel renders
              // above the choices it hands back.
              confirmation.answer(answer).catch(() => {});
            }}
          />
        )}
        <SessionComposer
          // Waiting on an answer is the opposite of busy; the caption is the
          // reason below either way. A stalled turn still withholds Send —
          // kagent would refuse the message — but says so instead of promising
          // a reply.
          isAgentWorking={isConfirming ? false : showWorking || isStalled}
          isStalled={isStalled}
          isFinished={Boolean(state && !state.isActive)}
          disabledReason={
            isConfirming
              ? "Answer the agent's question above to carry on. A plain message would start a new turn instead of answering it."
              : undefined
          }
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
          newSession={
            offersNewSession
              ? {
                  label: `Start a new session with ${row.agentName || 'this agent'}`,
                  onStart: draft => {
                    // Errors surface through the create hook's `error`, which
                    // the notice renders.
                    startNewSession(draft).catch(() => {});
                  },
                  isStarting: creation.isCreating,
                  replacesSend: runtimeLoss!.reported,
                  caption: runtimeLoss!.reported
                    ? 'This session cannot continue. Your message starts a new session with the same agent. Enter starts it, Shift+Enter for a new line.'
                    : 'Sending again retries the runtime. If it fails the same way, start a new session with the same agent — your message goes with it.',
                }
              : undefined
          }
          // The user arrived here by starting the session — typing in a composer
          // one screen ago — and the navigation dropped the focus. Restoring it to
          // the box is continuity, the one case the a11y rule does not have in mind;
          // a session merely opened from the list gets no autofocus.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={Boolean(handoff)}
          onSubmit={text => {
            // Errors are surfaced through the hook's `error`, which the composer
            // renders beside the text it hands back.
            send.sendMessage(text).catch(() => {});
            // The optimistic echo appears at the very bottom; go where it is.
            scrollToBottom();
          }}
        />
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

  return (
    <Shell
      installation={installation}
      sessionId={sessionId}
      currentSessionState={currentSessionState}
    >
      <Flex direction="column" gap="4" className={classes.column}>
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

        <Flex direction="column" gap="2">
          <BackToSessions>← Sessions</BackToSessions>
          <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
            {/* The underline on hover says "this does something"; it does not say
                what. Everything else on this page is inert text, so without a label
                the affordance is only findable by clicking a heading on the off
                chance — which nobody does.

                MUI's tooltip rather than bui's: bui wraps react-aria's
                `TooltipTrigger`, which only wires up its own focusable components,
                and this trigger is a bare <button> so it can inherit the heading's
                typography. */}
            <Tooltip title="Rename session">
              <button
                type="button"
                className={classes.titleButton}
                onClick={openRename}
                // The accessible name has to say what pressing this does, since the
                // visible text is the session's name and says nothing about
                // renaming. The tooltip is the sighted equivalent of this.
                aria-label={`Rename session "${sessionTitle}"`}
              >
                {/* `as="span"`: Text renders a <p> by default, which is not valid
                    inside a button. */}
                <Text as="span" variant="title-medium">
                  {sessionTitle}
                </Text>
              </button>
            </Tooltip>
            {/* The raw A2A state is kept as the label for anything we don't
                recognise, so a future kagent state shows as itself. */}
            {state && <Badge size="small">{state.label}</Badge>}
            {!state && <Badge size="small">no activity</Badge>}
            {/* The same mark the list and the rail carry, so the session reads
                the same on the way in as on the page. Only kagent's own word
                earns it; the interim reading is the notice's. */}
            {runtimeLoss?.reported && (
              <Badge size="small" title={RUNTIME_LOST_TITLE}>
                {RUNTIME_LOST_LABEL}
              </Badge>
            )}
          </Flex>

          <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
            {row.agentName && (
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
                    <Text
                      as="span"
                      variant="body-medium"
                      style={{ color: 'inherit' }}
                    >
                      {row.agentName}
                    </Text>
                  </Link>
                ) : (
                  <Text variant="body-medium">{row.agentName}</Text>
                )}
              </Flex>
            )}
            <Flex align="center" gap="1">
              <Text variant="body-medium" color="secondary">
                on
              </Text>
              <InstallationChip installation={row.installation} />
            </Flex>
          </Flex>

          {/* Absolute, not relative: the list keeps the relative form, where
              scanning for recency is the point. No last activity and no
              duration: kagent API v2 does not move `updated_at` on a turn, so
              both would only restate the start (kagent-dev/kagent#2397). */}
          <Text variant="body-small" color="secondary">
            Started{' '}
            {row.createdAt ? <DateComponent value={row.createdAt} /> : '—'}
          </Text>
        </Flex>

        <Box className={classes.stats}>
          <Stat
            label="Turns"
            value={String(taskCount)}
            hint="One per message sent to the agent. A turn counts once however many model and tool calls the answer took."
          />
          {/* Labelled "billed", because the raw number is startling: every model
              call re-sends the whole context, so a 4-turn session with a large tool
              catalogue reached 1.4M prompt tokens across 14 calls. That is genuine
              cumulative usage — kagent's own UI sums it the same way — but without
              the label it reads as a bug.
              There is deliberately no combined total: input and output are priced
              differently, so the sum is not a number anyone acts on. */}
          <Stat
            label="Input tokens (billed)"
            value={formatTokens(timeline.tokens.prompt)}
            hint="Every token sent to a model in this session, summed over each call, delegated agents' included."
          />
          <Stat
            label="Output tokens"
            value={formatTokens(timeline.tokens.completion)}
            hint="Every token a model generated in this session, delegated agents' included."
          />
          {/* Estimated, not billed, and the hint has to say *how*: the
              gateway prices whole model calls and its metrics carry no session
              label, so a session's cost can only ever be its tokens times an
              observed rate. Which rate that is decides whether the figure is
              worth anything, so `describeCostBasis` names the tier rather than
              leaving the reader to assume the best case. Reads "—" rather than
              "$0.00" when there is no rate to apply — zero spend and unpriced
              spend are different facts. */}
          <Stat
            label="Est. cost"
            value={formatUsd(estimatedCostUsd)}
            hint={describeCostBasis({
              tier: rateTier,
              model: row.agentModel,
              installation: row.installation,
              window: rateWindow,
              tokens: timeline.tokens.total,
            })}
          />
        </Box>

        <SessionTimeline
          timeline={timelineWithLive}
          agentName={row.agentName}
          agentAvatarUrl={avatarUrl}
          isAgentWorking={showWorking}
          streamLost={streamLost}
          stalledSince={stalledSince}
          onCancelTurn={isStalled ? stopTurn : undefined}
          isCancellingTurn={cancellation.isCancelling}
        />

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
