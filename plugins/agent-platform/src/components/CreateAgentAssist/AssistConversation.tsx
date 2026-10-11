import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Progress } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { AWAITING_INPUT_STATES } from '@giantswarm/backstage-plugin-agent-platform-common';

import { useAnswerConfirmation } from '../../hooks/useAnswerConfirmation';
import { useKagentCapabilities } from '../../hooks/useKagentCapabilities';
import { useSendMessage } from '../../hooks/useSendMessage';
import { useSessionDetail } from '../../hooks/useSessionDetail';
import { extractFencedBlocks, type FencedBlock } from '../../lib/fencedBlocks';
import { sessionDetailRouteRef } from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { PendingConfirmationPanel } from '../PendingConfirmationPanel';
import { SessionComposer } from '../SessionComposer';
import { SessionTimeline } from '../SessionTimeline';
import { AssistSuggestions } from './AssistSuggestions';
import { mergeLiveTimeline } from './mergeLiveTimeline';

const useStyles = makeStyles(theme => ({
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  // The conversation scrolls; the composer below stays reachable however long
  // it gets — the panel's version of the detail page's docked composer.
  // `contain`: a swipe that reaches the end of the chat does not go on to
  // scroll the page behind the panel.
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    padding: theme.spacing(2),
  },
  dock: {
    borderTop: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(2),
    // The panel reaches the screen's bottom edge: clear of a phone's home
    // indicator (0 everywhere else).
    paddingBottom: `calc(${theme.spacing(2)}px + env(safe-area-inset-bottom, 0px))`,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
  },
}));

/** How close to the end still counts as "reading the end" for auto-follow. */
const FOLLOW_THRESHOLD_PX = 240;

export type AssistConversationProps = {
  installation: string;
  sessionId: string;
  /** The assist agent's resource coordinates — where messages are sent. */
  agent: { namespace: string; name: string };
  agentName: string;
  agentAvatarUrl?: string;
  /**
   * The prompt the session was started with. The create and the send are two
   * kagent calls and only the create happened before this mounted (see
   * "Starting a session" in docs/agent-platform.md) — this component
   * dispatches it, once, exactly as the session detail page does on a handoff.
   */
  firstMessage: string;
};

/**
 * The assist panel's chat: the same conversation the session detail page
 * renders — polled timeline, streamed live turn, composer, the agent's
 * questions (`ask_user`) answered in place — reduced to what helping with a
 * form needs. No rename/delete, no cost, no stall/cancel or lost-runtime
 * handling: for anything beyond a working conversation the footer links to
 * the full session, which has all of it.
 *
 * What makes it the *assist* conversation is the suggestion strip: the fenced
 * code blocks of the agent's newest reply, each with a "Use these
 * instructions" button into the form (see `AssistSuggestions` for why that is
 * the whole accept mechanism).
 */
export function AssistConversation({
  installation,
  sessionId,
  agent,
  agentName,
  agentAvatarUrl,
  firstMessage,
}: AssistConversationProps) {
  const classes = useStyles();
  const view = useSessionDetail(installation, sessionId);
  const send = useSendMessage(installation, sessionId, agent);
  const confirmation = useAnswerConfirmation(installation, sessionId, agent);
  const { isUserScoped } = useKagentCapabilities(installation);
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);

  // Dispatch the session's first message, once — the composer that created the
  // session could not send it, since `message/send` blocks for the whole turn.
  const { sendMessage } = send;
  const dispatched = useRef(false);
  useEffect(() => {
    if (dispatched.current) {
      return;
    }
    dispatched.current = true;
    // Errors surface through `send.error` and `send.failed`, exactly as for a
    // reply typed into the composer — which also hands the text back.
    sendMessage(firstMessage).catch(() => {});
  }, [firstMessage, sendMessage]);

  // At most one of the two streams is in flight: the answer panel replaces the
  // composer while a question is open.
  const stream = send.stream ?? confirmation.stream;
  const timeline = useMemo(
    () => mergeLiveTimeline(view.timeline, send.pending, stream),
    [view.timeline, send.pending, stream],
  );

  const answerDispatched = Boolean(confirmation.stream?.dispatched);
  const showWorking =
    send.isSending ||
    (confirmation.isAnswering && answerDispatched) ||
    view.isAgentWorking;

  // Follow the reply as it arrives — but only when already reading the end,
  // and only this panel's own scroller, never the page.
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamTick = stream?.revision ?? 0;
  const itemCount = timeline.items.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD_PX;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [streamTick, itemCount]);

  // The newest reply that carries fenced blocks is the current proposal; an
  // older reply's draft is superseded the moment a newer one arrives.
  const suggestion = useMemo<
    { messageId: string; blocks: FencedBlock[] } | undefined
  >(() => {
    for (let index = timeline.items.length - 1; index >= 0; index -= 1) {
      const item = timeline.items[index];
      if (item.kind === 'agent-message') {
        const blocks = extractFencedBlocks(item.text);
        if (blocks.length > 0) {
          return { messageId: item.id, blocks };
        }
      }
    }
    return undefined;
  }, [timeline.items]);

  // Accept-into-form, with the one-step undo the artboard shows. The previous
  // value is kept so "Undo" restores exactly what the field held — including
  // empty, which means "use the chart's default prompt".
  const { state: formState, setSystemMessage } = useNewAgentForm();
  const [applied, setApplied] = useState<{
    messageId: string;
    index: number;
    previous: string;
  } | null>(null);
  const handleUse = (index: number, code: string) => {
    if (!suggestion) {
      return;
    }
    setApplied({
      messageId: suggestion.messageId,
      index,
      previous: formState.systemMessage,
    });
    setSystemMessage(code.trim());
  };
  const handleUndo = () => {
    if (!applied) {
      return;
    }
    setSystemMessage(applied.previous);
    setApplied(null);
  };
  const appliedIndex =
    applied && suggestion && applied.messageId === suggestion.messageId
      ? applied.index
      : undefined;

  // The agent asked something; a plain message cannot answer it (see the
  // session detail page). The panel goes as soon as the answer's stream has
  // its first event.
  const isConfirming =
    Boolean(view.pendingConfirmation) &&
    !answerDispatched &&
    Boolean(view.state && AWAITING_INPUT_STATES.has(view.state.key));

  const fullSessionHref = sessionDetailRoute?.({ installation, sessionId });

  if (view.isLoading) {
    return (
      <div className={classes.root}>
        <div className={classes.scroll}>
          <Progress aria-label="Loading the conversation" />
        </div>
      </div>
    );
  }

  return (
    <div className={classes.root}>
      <div ref={scrollRef} className={classes.scroll}>
        <Flex direction="column" gap="3">
          {view.error && (
            <Alert
              status="warning"
              title="This conversation may be out of date"
              description={`The last refresh failed: ${view.error.message}`}
            />
          )}
          <SessionTimeline
            timeline={timeline}
            agentName={agentName}
            agentAvatarUrl={agentAvatarUrl}
            isAgentWorking={showWorking}
            streamLost={
              (send.isStreamLost || confirmation.isStreamLost) && showWorking
                ? 'following'
                : undefined
            }
          />
          {suggestion && (
            <AssistSuggestions
              blocks={suggestion.blocks}
              appliedIndex={appliedIndex}
              onUse={handleUse}
              onUndo={handleUndo}
            />
          )}
        </Flex>
      </div>
      <div className={classes.dock}>
        {isConfirming && view.pendingConfirmation && (
          <PendingConfirmationPanel
            pending={view.pendingConfirmation}
            agentName={agentName}
            isAnswering={confirmation.isAnswering}
            error={confirmation.error?.message}
            restore={confirmation.failed}
            isUserScoped={isUserScoped}
            onAnswer={answer => {
              // Errors surface through the hook's `error`, which the panel
              // renders above the choices it hands back.
              confirmation.answer(answer).catch(() => {});
            }}
          />
        )}
        <SessionComposer
          isAgentWorking={isConfirming ? false : showWorking}
          isFinished={Boolean(view.state && !view.state.isActive)}
          disabledReason={
            isConfirming
              ? "Answer the agent's question above to carry on."
              : undefined
          }
          error={send.error?.message}
          restore={send.failed}
          onSubmit={text => {
            // Errors surface through the hook's `error`, shown by the composer.
            send.sendMessage(text).catch(() => {});
          }}
        />
        {fullSessionHref && (
          <Text variant="body-small" color="secondary">
            Everything here is an ordinary session —{' '}
            {/* A new tab: navigating this one away discards the form. */}
            <Link
              to={fullSessionHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              open it in full
            </Link>{' '}
            for details and history.
          </Text>
        )}
      </div>
    </div>
  );
}
