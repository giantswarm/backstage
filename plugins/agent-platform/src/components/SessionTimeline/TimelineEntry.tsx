import { Alert, Badge } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import LoopIcon from '@material-ui/icons/Loop';

import { TimelineItem } from '../../lib/kagentTimeline';
import { ActivityRow, InertActivityRow } from './ActivityRow';
import { MessageMarkdown } from './MessageMarkdown';
import { PayloadBlock } from './PayloadBlock';
import {
  agentCallLabel,
  expandablePayloads,
  formatTokens,
  hasExpandableDetail,
  summarizeArgs,
} from './helpers';

const useStyles = makeStyles(theme => ({
  // The user's message is a bubble on the right, the agent's prose plain on the
  // left — the alignment carries who speaks, the way every chat surface does.
  userRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  userBubble: {
    maxWidth: '85%',
    backgroundColor: 'var(--bui-bg-neutral-2)',
    // The bui neutrals sit within a couple of points of the light theme's page
    // background, so without an outline the bubble dissolves into the page.
    border: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(1.25, 2),
    borderRadius: 'var(--bui-radius-3)',
  },
  // Deliberately not markdown: prompts quote logs, manifests and `#` headings
  // that must stay the characters the user typed.
  userText: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontSize: '0.875rem',
    lineHeight: 1.6,
    fontFamily: 'inherit',
  },
  // The bubble says "you" visually; this keeps saying it to assistive tech.
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  triggerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    minWidth: 0,
    flex: 1,
  },
  rowName: {
    fontFamily: 'monospace',
    fontSize: '0.8125rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  rowTitle: {
    fontSize: '0.8125rem',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  summary: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    flex: 1,
  },
  spinner: {
    width: 14,
    height: 14,
    flexShrink: 0,
    color: theme.palette.text.secondary,
    animation: '$spin 1s linear infinite',
    '@media (prefers-reduced-motion)': {
      animation: 'none',
    },
  },
  '@keyframes spin': {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(-360deg)' },
  },
  reasoningBody: {
    borderLeft: `2px solid ${theme.palette.divider}`,
    paddingLeft: theme.spacing(1.5),
    color: theme.palette.text.secondary,
    fontStyle: 'italic',
    maxHeight: 320,
    overflowY: 'auto',
  },
  payloads: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
  },
  questions: {
    // Indented to hang under the row's text, past the chevron gutter.
    paddingLeft: theme.spacing(3),
  },
  // The reason is the provider's or runtime's error verbatim — often a JSON body
  // with its own line breaks — so it keeps its shape rather than collapsing into
  // one long line, and wraps rather than widening the column.
  failureReason: {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontFamily: 'monospace',
    fontSize: '0.8125rem',
  },
}));

export type TimelineEntryProps = {
  item: TimelineItem;
  /** Whether a collapsible entry starts open. */
  defaultExpanded?: boolean;
  /**
   * Whether the agent is mid-turn. A pending call then shows a spinner —
   * it is genuinely running — where a pending call in a finished session
   * shows "no result": nothing is coming.
   */
  isAgentWorking?: boolean;
};

/** Prose from the agent, rendered as markdown. */
function MessageBody({ text }: { text: string }) {
  return <MessageMarkdown text={text} />;
}

/**
 * What to call an entry's arguments.
 *
 * A confirmation request's payload is not something the agent did: for a permission
 * request it is the call it *proposed*, and for `ask_user` it is the questions
 * themselves.
 */
function argsLabel(item: TimelineItem): string {
  if (item.kind !== 'approval') {
    return 'Arguments';
  }
  return item.asks === 'input' ? 'Questions' : 'Proposed arguments';
}

/** Label and payloads for a tool call or a delegation. */
function CallDetail({ item }: { item: TimelineItem }) {
  const classes = useStyles();
  const payloads = expandablePayloads(item);
  if (!payloads) {
    return null;
  }
  const { args, result } = payloads;

  return (
    <div className={classes.payloads}>
      {args && <PayloadBlock label={argsLabel(item)} content={args} />}
      {result && <PayloadBlock label="Result" content={result} />}
    </div>
  );
}

/**
 * Whether a pending call should read as running.
 *
 * `isPending` only says kagent recorded no result. While the agent works that
 * means "in flight"; once the session is done it means the result never came.
 */
function PendingMarker({
  isPending,
  isAgentWorking,
}: {
  isPending: boolean;
  isAgentWorking: boolean;
}) {
  const classes = useStyles();
  if (!isPending) {
    return null;
  }
  if (isAgentWorking) {
    return <LoopIcon className={classes.spinner} aria-label="running" />;
  }
  return <Badge size="small">no result</Badge>;
}

/** The one-line header of a collapsible entry. */
function CollapsedSummary({
  item,
  isAgentWorking = false,
}: {
  item: TimelineItem;
  isAgentWorking?: boolean;
}) {
  const classes = useStyles();

  switch (item.kind) {
    case 'reasoning':
      return (
        <span className={classes.triggerContent}>
          <span className={classes.rowTitle}>Reasoning</span>
          <span className={classes.summary}>
            {item.text.replace(/\s+/g, ' ').trim()}
          </span>
        </span>
      );
    case 'tool-call':
      return (
        <span className={classes.triggerContent}>
          <span className={classes.rowName}>{item.toolName}</span>
          {/* Agents reach most MCP tools through muster's `call_tool`, so the
              parser looks through that wrapper and names the real tool. The badge
              keeps the fact that it was proxied, which is otherwise lost. */}
          {item.via && <Badge size="small">via {item.via}</Badge>}
          <PendingMarker
            isPending={item.isPending}
            isAgentWorking={isAgentWorking}
          />
          <span className={classes.summary}>{summarizeArgs(item.args)}</span>
        </span>
      );
    case 'agent-call':
      return (
        <span className={classes.triggerContent}>
          <span className={classes.rowTitle}>
            Delegated to {agentCallLabel(item.agentId)}
          </span>
          {item.tokens && (
            <Badge size="small">{formatTokens(item.tokens.total)} tokens</Badge>
          )}
          <PendingMarker
            isPending={item.isPending}
            isAgentWorking={isAgentWorking}
          />
        </span>
      );
    case 'approval':
      return (
        <span className={classes.triggerContent}>
          <span className={classes.rowTitle}>
            {item.asks === 'input'
              ? 'User input requested'
              : 'Approval requested'}
          </span>
          {/* The proposed tool names what needs approving, which is the point of
              the row. For a question it is always `ask_user` — noise. */}
          {item.asks === 'approval' && item.toolName && (
            <span className={classes.summary}>{item.toolName}</span>
          )}
          <ApprovalVerdict item={item} />
        </span>
      );
    default:
      return null;
  }
}

/**
 * How the user answered a confirmation request.
 *
 * The wording follows what was asked. ADK records both a permission request and a
 * question as the same "approved"/"rejected" decision, but "Approved" says nothing
 * about a question — the user simply replied. So a question reports
 * "Responded"/"Declined" and a permission request "Approved"/"Rejected".
 *
 * An undefined verdict is never rendered as consent: the parser deliberately
 * declines to guess when kagent used wording it doesn't recognise, and claiming
 * approval would misreport the user's own action.
 */
function ApprovalVerdict({ item }: { item: TimelineItem }) {
  if (item.kind !== 'approval') {
    return null;
  }
  const isQuestion = item.asks === 'input';
  if (item.verdict === 'approved') {
    return <Badge size="small">{isQuestion ? 'Responded' : 'Approved'}</Badge>;
  }
  if (item.verdict === 'rejected') {
    return <Badge size="small">{isQuestion ? 'Declined' : 'Rejected'}</Badge>;
  }
  return (
    <Badge size="small">
      {isQuestion ? 'Awaiting a reply' : 'Awaiting a decision'}
    </Badge>
  );
}

/**
 * One entry in the session timeline.
 *
 * Conversation messages render in full — the user's as a right-aligned bubble,
 * the agent's as prose. Everything else — reasoning, tool calls, delegations,
 * approvals — is a quiet one-line disclosure row, because the agent's working is
 * what makes this screen worth opening but a wall of tool payloads is unreadable.
 *
 * `defaultExpanded` only applies on mount; the list keys each entry on the
 * global detail setting so changing it remounts them and the new default takes
 * effect.
 */
export function TimelineEntry({
  item,
  defaultExpanded = false,
  isAgentWorking = false,
}: TimelineEntryProps) {
  const classes = useStyles();

  // Narrowed on the kinds rather than through `isCollapsible`, so the compiler
  // knows `text` exists in this branch.
  if (item.kind === 'user-message') {
    return (
      <div className={classes.userRow} data-testid="timeline-user-message">
        <div className={classes.userBubble}>
          <span className={classes.srOnly}>You</span>
          <pre className={classes.userText}>{item.text}</pre>
        </div>
      </div>
    );
  }

  if (item.kind === 'agent-message') {
    return (
      <div data-testid="timeline-agent-message">
        <MessageBody text={item.text} />
      </div>
    );
  }

  // The turn ended in error. Rendered as an alert, not as prose: before this
  // entry existed a failed turn showed the user's message with nothing under it,
  // the "Failed" badge in the header being the only sign — and on a session whose
  // model the provider refuses, every message sent appeared to do nothing.
  if (item.kind === 'turn-failed') {
    return (
      <div data-testid="timeline-turn-failed">
        <Alert
          status="danger"
          icon
          title={
            item.state === 'rejected'
              ? 'This turn was rejected'
              : 'This turn failed'
          }
          description={
            item.reason ? (
              <span className={classes.failureReason}>{item.reason}</span>
            ) : (
              'kagent recorded no reason.'
            )
          }
        />
      </div>
    );
  }

  // No expander when there is nothing behind it. A disclosure that opens onto an
  // empty panel invites a click and answers with nothing.
  if (!hasExpandableDetail(item)) {
    const questions =
      item.kind === 'approval' ? (item.questions ?? []) : undefined;
    return (
      <div data-testid={`timeline-${item.kind}`}>
        <InertActivityRow>
          <CollapsedSummary item={item} isAgentWorking={isAgentWorking} />
        </InertActivityRow>
        {/* A question is the last thing the agent said, so it reads as prose in
            the conversation rather than as a payload to go looking for. Several
            questions can arrive in one `ask_user`; they are numbered so a reply
            can refer to them. */}
        {questions && questions.length > 0 && (
          <div className={classes.questions}>
            <MessageBody
              text={
                questions.length === 1
                  ? questions[0]
                  : questions.map((text, i) => `${i + 1}. ${text}`).join('\n\n')
              }
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div data-testid={`timeline-${item.kind}`}>
      <ActivityRow
        id={item.id}
        defaultExpanded={defaultExpanded}
        variant={item.kind === 'reasoning' ? 'plain' : 'card'}
        trigger={
          <CollapsedSummary item={item} isAgentWorking={isAgentWorking} />
        }
      >
        {item.kind === 'reasoning' ? (
          <div className={classes.reasoningBody}>
            <MessageBody text={item.text} />
          </div>
        ) : (
          <CallDetail item={item} />
        )}
      </ActivityRow>
    </div>
  );
}
