import { ReactNode } from 'react';
import { Alert, Badge, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import LoopIcon from '@material-ui/icons/Loop';

import {
  CANCELED_STATE,
  isRuntimeLostFailureText,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { PHONE_MEDIA } from '@giantswarm/backstage-plugin-ui-react';
import { TimelineItem } from '../../lib/kagentTimeline';
import { ActivityRow, InertActivityRow } from './ActivityRow';
import { AttachmentEntry } from './AttachmentEntry';
import { MessageMarkdown } from './MessageMarkdown';
import { PayloadBlock } from './PayloadBlock';
import {
  agentCallLabel,
  expandablePayloads,
  formatTokens,
  hasExpandableDetail,
  humanizeToolName,
  summarizeArgs,
} from './helpers';

const useStyles = makeStyles(theme => ({
  // The user's message is a bubble on the right, the agent's prose plain on the
  // left — the alignment carries who speaks, the way every chat surface does.
  userRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: theme.spacing(0.5),
  },
  userBubble: {
    maxWidth: '85%',
    // The portal's own colour, the same fill Send carries — and unlike bui's
    // accent token it follows `app.branding.theme.<mode>.primaryColor`, so a
    // white-labelled portal speaks in its own voice.
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
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
  // One line that ellipsizes rather than widening the row: at phone width a
  // long tool name would otherwise push the row past the viewport, since
  // `nowrap` text cannot shrink below its content without `minWidth: 0`.
  rowName: {
    fontFamily: 'monospace',
    fontSize: '0.8125rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  },
  rowTitle: {
    fontSize: '0.8125rem',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
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
    // The payloads' rule (`PayloadBlock`): a scroller short enough on a phone
    // that a swipe can land beside it and move the conversation (T22 C3).
    [PHONE_MEDIA]: {
      maxHeight: 'min(320px, 40dvh)',
    },
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

/**
 * The connector a tool name belongs to, as Customize names it, with the
 * tool's own part — `undefined` when no connector's prefix matches.
 */
export type ConnectorOf = (
  toolName: string,
) => { connector: string; tool: string } | undefined;

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
  /**
   * The row's register. Plain (the default) heads each tool call, delegation
   * and approval with a readable line — what it did, via which connector, and
   * its status — and folds the exact call (tool identifier, arguments,
   * result) out in place. Technical heads it with the exact tool name and the
   * argument summary, as inside an opened work summary. Either way the detail
   * is a disclosure on the row, never a view-wide switch.
   */
  technical?: boolean;
  /**
   * A user message only: a line under the bubble saying who wrote it when it
   * was not the person — the portal's prepared opener of a hand-off session.
   */
  caption?: string;
  /** Names a tool call's connector in the plain register (UX review M2). */
  connectorOf?: ConnectorOf;
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
function CallDetail({
  item,
  technical,
}: {
  item: TimelineItem;
  technical: boolean;
}) {
  const classes = useStyles();
  const payloads = expandablePayloads(item);
  if (!payloads) {
    return null;
  }
  const { args, result } = payloads;
  // A plain row's header names the tool in words; opening it is asking for
  // the exact call, so the identifier leads the detail.
  const exactName =
    item.kind === 'tool-call' || item.kind === 'approval'
      ? item.toolName
      : undefined;

  return (
    <div className={classes.payloads}>
      {!technical && exactName && (
        <span className={classes.rowName}>{exactName}</span>
      )}
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

/**
 * The one-line header of a trace entry.
 *
 * `technical` decides the register. Plain names what happened in words — the
 * tool's name split into a phrase, the connector it went via, its status — and
 * omits the argument summary, which is exactly the raw payload the plain view
 * exists to spare the reader. Technical keeps the exact identifiers.
 */
function CollapsedSummary({
  item,
  isAgentWorking = false,
  technical = false,
  connectorOf,
}: {
  item: TimelineItem;
  isAgentWorking?: boolean;
  technical?: boolean;
  connectorOf?: ConnectorOf;
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
    case 'tool-call': {
      // Plain names the connector as Customize does, and the tool without
      // the connector's prefix; technical keeps the exact identifiers.
      const owner = technical ? undefined : connectorOf?.(item.toolName);
      return (
        <span className={classes.triggerContent}>
          {technical ? (
            <span className={classes.rowName}>{item.toolName}</span>
          ) : (
            <span className={classes.rowTitle}>
              {humanizeToolName(owner?.tool ?? item.toolName)}
            </span>
          )}
          {/* Agents reach most MCP tools through muster's `call_tool`, so the
              parser looks through that wrapper and names the real tool. Plain
              names the connector the call went to; technical keeps the fact
              that it was proxied, which is otherwise lost. */}
          {owner && <Badge size="small">{owner.connector}</Badge>}
          {technical && item.via && <Badge size="small">via {item.via}</Badge>}
          <PendingMarker
            isPending={item.isPending}
            isAgentWorking={isAgentWorking}
          />
          {technical && (
            <span className={classes.summary}>{summarizeArgs(item.args)}</span>
          )}
        </span>
      );
    }
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
            <span className={technical ? classes.summary : classes.rowTitle}>
              {technical ? item.toolName : humanizeToolName(item.toolName)}
            </span>
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
 * `defaultExpanded` only applies on mount.
 */
export function TimelineEntry({
  item,
  defaultExpanded = false,
  isAgentWorking = false,
  technical = false,
  caption,
  connectorOf,
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
        {caption && (
          <Text
            as="p"
            variant="body-x-small"
            color="secondary"
            data-testid="timeline-user-message-caption"
          >
            {caption}
          </Text>
        )}
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

  if (item.kind === 'attachment') {
    return <AttachmentEntry item={item} />;
  }

  // The turn ended without answering — it failed, was rejected, or was canceled.
  // Rendered as an alert, not as prose: before this entry existed such a turn
  // showed the user's message with nothing under it, the header badge being the
  // only sign — and on a session whose model the provider refuses, every message
  // sent appeared to do nothing. The badge reads the *newest* task, so on a
  // session that went on afterwards there was no sign at all.
  if (item.kind === 'turn-failed') {
    // A turn the person stopped is not an error, so it does not wear one: an
    // `info` alert, in the words of the thing they did. Where a failure says
    // "kagent recorded no reason" when it gave none, a cancel says nothing at
    // all: kagent records no reason for one as a rule, the reason is that
    // somebody pressed Stop, and announcing its absence would read as a fault.
    //
    // The title carries it alone for a second reason. A canceled turn often has
    // the agent's half-finished reply directly above it — kagent keeps what it
    // streamed, as an artifact, and `toWireTask` merges that into the history —
    // so a line here about how far it got would contradict what the reader can
    // see. The entry says when the turn ended; the turn itself says what it
    // managed.
    if (item.state === CANCELED_STATE) {
      return (
        <div data-testid="timeline-turn-canceled">
          <Alert
            status="info"
            icon
            title="This turn was canceled"
            description={
              item.reason ? (
                <span className={classes.failureReason}>{item.reason}</span>
              ) : undefined
            }
          />
        </div>
      );
    }

    // A turn the *runtime* failed — kagent could not bring the agent's process
    // back to read the message — is not the agent's failure, and the runtime's
    // words alone (`actor "ai-…" request timed out`) explained nothing to the
    // person who read them on gazelle. Said in the portal's words, with the
    // runtime's kept as the evidence; the page's notice below the conversation
    // carries the way out.
    const runtimeLost = isRuntimeLostFailureText(item.reason);
    let title = 'This turn failed';
    if (runtimeLost) {
      title = 'Could not reach the agent’s runtime';
    } else if (item.state === 'rejected') {
      title = 'This turn was rejected';
    }
    let description: ReactNode = 'kagent recorded no reason.';
    if (runtimeLost) {
      description = (
        <span className={classes.failureReason}>
          kagent could not bring the agent’s runtime back to answer this
          message. The runtime said: {item.reason}
        </span>
      );
    } else if (item.reason) {
      description = (
        <span className={classes.failureReason}>{item.reason}</span>
      );
    }
    return (
      <div
        data-testid="timeline-turn-failed"
        data-runtime-lost={runtimeLost ? 'true' : undefined}
      >
        <Alert status="danger" icon title={title} description={description} />
      </div>
    );
  }

  // No expander when there is nothing behind it. A disclosure that opens onto an
  // empty panel invites a click and answers with nothing. Everything else
  // folds its detail out in place — reasoning its prose, a call or an approval
  // its exact arguments and result.
  const isExpandable = hasExpandableDetail(item);
  if (!isExpandable) {
    const questions =
      item.kind === 'approval' ? (item.questions ?? []) : undefined;
    return (
      <div data-testid={`timeline-${item.kind}`}>
        <InertActivityRow>
          <CollapsedSummary
            item={item}
            isAgentWorking={isAgentWorking}
            technical={technical}
            connectorOf={connectorOf}
          />
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
          <CollapsedSummary
            item={item}
            isAgentWorking={isAgentWorking}
            technical={technical}
            connectorOf={connectorOf}
          />
        }
      >
        {item.kind === 'reasoning' ? (
          <div className={classes.reasoningBody}>
            <MessageBody text={item.text} />
          </div>
        ) : (
          <CallDetail item={item} technical={technical} />
        )}
      </ActivityRow>
    </div>
  );
}
