import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams } from 'react-router-dom';
import {
  Content,
  EmptyState,
  Link,
  Progress,
} from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Avatar, Badge, Box, Flex, Text } from '@backstage/ui';
import { makeStyles, Tooltip } from '@material-ui/core';
import {
  DateComponent,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';

import { useDeleteSession } from '../../hooks/useDeleteSession';
import { useKagentCapabilities } from '../../hooks/useKagentCapabilities';
import { useAnswerConfirmation } from '../../hooks/useAnswerConfirmation';
import { useNewSessionHandoff } from '../../hooks/useNewSessionHandoff';
import { useRenameSession } from '../../hooks/useRenameSession';
import { useSendMessage } from '../../hooks/useSendMessage';
import { useSessionDetail } from '../../hooks/useSessionDetail';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { AvatarSize } from '../../lib/agentAvatar';
import { AWAITING_INPUT_STATES } from '../../lib/kagentSessionState';
import { sessionsRouteRef } from '../../routes';
import { useAgents } from '../AgentsDataProvider';
import { PendingConfirmationPanel } from '../PendingConfirmationPanel';
import { SessionComposer } from '../SessionComposer';
import { SessionActionsMenu } from './SessionActionsMenu';
import { SessionRenameDialog } from './SessionRenameDialog';
import {
  buildAgentIndex,
  SESSION_TITLE_FALLBACK,
  toSessionRow,
} from '../SessionsDataProvider/helpers';
import {
  formatDuration,
  formatTokens,
  SessionTimeline,
} from '../SessionTimeline';

/** Matches the list's row avatar: one line of text, 2× for hi-dpi. */
const AVATAR_SIZE: AvatarSize = 48;

const useStyles = makeStyles(theme => ({
  stats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(4),
    paddingTop: theme.spacing(1.5),
    paddingBottom: theme.spacing(1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  statValue: {
    fontVariantNumeric: 'tabular-nums',
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

function Stat({ label, value }: { label: string; value: string }) {
  const classes = useStyles();
  return (
    <Flex direction="column" gap="1">
      <Text variant="body-small" color="secondary">
        {label}
      </Text>
      <Text variant="title-small" className={classes.statValue}>
        {value}
      </Text>
    </Flex>
  );
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
    isAgentWorking: agentIsWorking,
    pendingConfirmation,
    taskCount,
    hasConversation,
    isLoading,
    isNotFound,
    error,
  } = useSessionDetail(installation, sessionId, {
    enabled: !deletion.isDeleting && !deletion.isDeleted,
  });

  // The same join the list uses, so a session's agent is named identically in both
  // places — and falls back to the same lossy decode when no Agent CR matched.
  const { rows: agentRows } = useAgents();
  const agentRowsKey = agentRows
    .map(agent => `${agent.id}@${agent.name}`)
    .join('|');
  const agentIndex = useMemo(
    () => buildAgentIndex(agentRows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentRowsKey],
  );

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
  const send = useSendMessage(installation, sessionId, agent);
  const confirmation = useAnswerConfirmation(installation, sessionId, agent);

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
  const timelineWithLive = useMemo(() => {
    const pending = send.pending;
    const stream = send.stream;

    const pendingVisible =
      pending &&
      !timeline.items.some(item => item.messageId === pending.messageId);
    const streamVisible =
      stream &&
      (stream.items.length > 0 || stream.liveText || stream.liveReasoning);

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
      for (const item of stream.items) {
        if (item.messageId && polled.has(item.messageId)) {
          continue;
        }
        items.push({ ...item, taskIndex });
      }
      if (stream.liveReasoning.trim()) {
        items.push({
          kind: 'reasoning' as const,
          id: 'stream:live-reasoning',
          taskIndex,
          text: stream.liveReasoning,
        });
      }
      if (stream.liveText.trim()) {
        items.push({
          kind: 'agent-message' as const,
          id: 'stream:live-text',
          taskIndex,
          text: stream.liveText,
        });
      }
    }

    return { ...timeline, items };
  }, [timeline, send.pending, send.stream]);

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
        />
      ) : null,
    [row, sessionTitle, deletion, openRename, isUserScoped],
  );
  useProvidePageHeaderActions(actions);

  if (isLoading) {
    return (
      <Content>
        <Progress aria-label="Loading session" />
      </Content>
    );
  }

  if (isNotFound) {
    return (
      <Content>
        <EmptyState
          missing="data"
          title="Session not found"
          description={`No session with this id exists on ${
            installation || 'that installation'
          }. It may have been deleted, or belong to another user — kagent only lets you read your own sessions.`}
          action={<BackToSessions>Back to sessions</BackToSessions>}
        />
      </Content>
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
      <Content>
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
      </Content>
    );
  }

  /**
   * Whether to say the agent is working.
   *
   * Two signals, because neither covers a whole turn on its own:
   *
   * - the conversation's own verdict (`isAgentWorking` — active, not waiting on a
   *   human, and moved recently), which only arrives once a poll has seen the new
   *   task, up to 10 s after sending;
   * - the in-flight send, which covers exactly that gap and cannot carry the rest:
   *   the gateway cuts the request off well before a long turn ends (60 s on a
   *   stock route), so it goes false mid-turn while the agent works on.
   */
  const showWorking = send.isSending || agentIsWorking;

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
  } else if (state && AWAITING_INPUT_STATES.has(state.key)) {
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
  } else if (pendingConfirmation && agent) {
    // The panel *and* the composer, the latter disabled. A plain message cannot
    // answer a confirmation — it opens a new task and strands this one — so the
    // composer must not submit. But removing it outright reads as the reply feature
    // being missing rather than blocked, so it stays in place saying why. kagent's
    // own UI makes the same call, leaving its box on screen with
    // `Awaiting approval…` in it.
    bottomControl = (
      <Flex direction="column" gap="4">
        <PendingConfirmationPanel
          pending={pendingConfirmation}
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
        <SessionComposer
          isAgentWorking={false}
          isFinished={false}
          disabledReason="Answer the agent's question above to carry on. A plain message would start a new turn instead of answering it."
          onSubmit={() => {}}
        />
      </Flex>
    );
  } else {
    bottomControl = (
      <SessionComposer
        isAgentWorking={showWorking}
        isFinished={Boolean(state && !state.isActive)}
        error={send.error?.message}
        // On failure the optimistic copy is dropped, so this is the only place the
        // user's text still exists.
        restore={send.failed}
        onSubmit={text => {
          // Errors are surfaced through the hook's `error`, which the composer
          // renders beside the text it hands back.
          send.sendMessage(text).catch(() => {});
        }}
      />
    );
  }

  const avatarUrl = row.agentTechnicalName
    ? buildAvatarUrl(row.installation, row.agentTechnicalName, {
        size: AVATAR_SIZE,
      })
    : undefined;

  return (
    <Content>
      <Flex direction="column" gap="4">
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
                typography. Same fallback the plugin's `CopyButton` makes. */}
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
          </Flex>

          <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
            {row.agentName && (
              <Flex align="center" gap="2">
                <Avatar
                  size="small"
                  purpose="decoration"
                  name={row.agentName}
                  src={avatarUrl ?? ''}
                />
                <Text variant="body-medium">{row.agentName}</Text>
              </Flex>
            )}
            <Text variant="body-medium" color="secondary">
              on {row.installation}
            </Text>
          </Flex>

          {/* Absolute, not relative. Both ends of a session are frequently within
              the same day, so the relative form rendered "1 day ago · 1 day ago" —
              identical for two timestamps 34 minutes apart, which told the reader
              nothing. The Duration stat below now carries the span, so an exact
              start time is the more useful thing to show here. The list keeps the
              relative form, where scanning for recency is the point. */}
          <Text variant="body-small" color="secondary">
            Started{' '}
            {row.createdAt ? <DateComponent value={row.createdAt} /> : '—'}
            {' · last activity '}
            {row.updatedAt ? <DateComponent value={row.updatedAt} /> : '—'}
          </Text>
        </Flex>

        <Box className={classes.stats}>
          <Stat label="Turns" value={String(taskCount)} />
          {/* Wall-clock span, not compute time — kagent records no per-turn
              durations, so this includes however long the user was away between
              turns. */}
          <Stat
            label="Duration"
            value={formatDuration(row.createdAt, row.updatedAt) ?? '—'}
          />
          {/* Labelled "billed", because the raw number is startling: every model
              call re-sends the whole context, so a 4-turn session with a large tool
              catalogue reached 1.4M prompt tokens across 14 calls. That is genuine
              cumulative usage — kagent's own UI sums it the same way — but without
              the label it reads as a bug.
              There is deliberately no combined total: input and output are priced
              differently, so the sum is not a number anyone acts on. */}
          <Stat
            label="Input tokens (billed, cumulative)"
            value={formatTokens(timeline.tokens.prompt)}
          />
          <Stat
            label="Output tokens"
            value={formatTokens(timeline.tokens.completion)}
          />
        </Box>

        <SessionTimeline
          timeline={timelineWithLive}
          agentName={row.agentName}
          isAgentWorking={showWorking}
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
    </Content>
  );
}
