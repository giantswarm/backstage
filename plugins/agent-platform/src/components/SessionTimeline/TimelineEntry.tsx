import {
  Accordion,
  AccordionGroup,
  AccordionPanel,
  AccordionTrigger,
  Badge,
  Flex,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { GSMarkdownContent } from '@giantswarm/backstage-plugin-ui-react';

import { TimelineItem } from '../../lib/kagentTimeline';
import { CodeBlock } from '../CodeBlock';
import {
  agentCallLabel,
  authorLabel,
  formatPayload,
  formatTokens,
  summarizeArgs,
} from './helpers';

const useStyles = makeStyles(theme => ({
  entry: {
    // A left rule ties an entry's parts together and keeps the agent's internal
    // work visually subordinate to the conversation.
    paddingLeft: theme.spacing(1.5),
    borderLeft: `2px solid ${theme.palette.divider}`,
  },
  userEntry: {
    borderLeftColor: theme.palette.primary.main,
  },
  summary: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: theme.palette.text.secondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  // AccordionTrigger has no bottom padding, so an expanded header sits flush
  // against its panel and reads top-heavy.
  accordion: {
    '& [aria-expanded="true"]': {
      paddingBottom: theme.spacing(0.75),
    },
  },
  payloadLabel: {
    display: 'block',
    marginBottom: theme.spacing(0.5),
  },
  // Matches an AccordionTrigger's vertical rhythm, so a row with nothing to expand
  // still lines up with the ones that do.
  inertSummary: {
    paddingTop: theme.spacing(0.75),
    paddingBottom: theme.spacing(0.75),
  },
}));

export type TimelineEntryProps = {
  item: TimelineItem;
  /**
   * Display name of the `Agent` CR this session belongs to, when one matched.
   * Preferred over the raw author, since decoding a python identifier is lossy.
   */
  resolvedAgentName?: string;
  /** Whether a collapsible entry starts open. */
  defaultExpanded?: boolean;
};

/** Prose from the user or the agent, rendered as markdown. */
function MessageBody({ text }: { text: string }) {
  return <GSMarkdownContent content={text} />;
}

/** Label and payloads for a tool call or a delegation. */
/**
 * The payloads an item can show when expanded, or `undefined` when it has none.
 *
 * Returning `undefined` is what lets the caller render a plain row instead of an
 * accordion: an expander that opens onto nothing is worse than no expander.
 */
function payloadsOf(
  item: TimelineItem,
): { args?: string; result?: string } | undefined {
  if (
    item.kind !== 'tool-call' &&
    item.kind !== 'agent-call' &&
    item.kind !== 'approval'
  ) {
    return undefined;
  }
  const args = formatPayload(item.args);
  // Approvals have no result — they carry the *proposed* call, which never ran as
  // this item.
  const result =
    item.kind === 'approval' ? undefined : formatPayload(item.result);
  if (!args && !result) {
    return undefined;
  }
  return { args, result };
}

function CallDetail({ item }: { item: TimelineItem }) {
  const classes = useStyles();
  const payloads = payloadsOf(item);
  if (!payloads) {
    return null;
  }
  const { args, result } = payloads;

  return (
    <Flex direction="column" gap="2">
      {args && (
        <div>
          <Text
            variant="body-small"
            color="secondary"
            className={classes.payloadLabel}
          >
            {/* An approval's arguments are what the agent *proposed* to run, not
                something it did — worth naming differently. */}
            {item.kind === 'approval' ? 'Proposed arguments' : 'Arguments'}
          </Text>
          <CodeBlock content={args} />
        </div>
      )}
      {result && (
        <div>
          <Text
            variant="body-small"
            color="secondary"
            className={classes.payloadLabel}
          >
            Result
          </Text>
          <CodeBlock content={result} />
        </div>
      )}
    </Flex>
  );
}

/** The one-line header of a collapsible entry. */
function CollapsedSummary({ item }: { item: TimelineItem }) {
  const classes = useStyles();

  switch (item.kind) {
    case 'reasoning':
      return (
        <Flex align="center" gap="2" style={{ minWidth: 0 }}>
          <Text variant="body-medium" weight="bold">
            Reasoning
          </Text>
          <span className={classes.summary}>
            {item.text.replace(/\s+/g, ' ').trim()}
          </span>
        </Flex>
      );
    case 'tool-call':
      return (
        <Flex align="center" gap="2" style={{ minWidth: 0 }}>
          <Text variant="body-medium" weight="bold">
            {item.toolName}
          </Text>
          {/* Agents reach most MCP tools through muster's `call_tool`, so the
              parser looks through that wrapper and names the real tool. The badge
              keeps the fact that it was proxied, which is otherwise lost. */}
          {item.via && <Badge size="small">via {item.via}</Badge>}
          {item.isPending && <Badge size="small">no result</Badge>}
          <span className={classes.summary}>{summarizeArgs(item.args)}</span>
        </Flex>
      );
    case 'agent-call':
      return (
        <Flex align="center" gap="2" style={{ minWidth: 0 }}>
          <Text variant="body-medium" weight="bold">
            Delegated to {agentCallLabel(item.agentId)}
          </Text>
          {item.tokens && (
            <Badge size="small">{formatTokens(item.tokens.total)} tokens</Badge>
          )}
          {item.isPending && <Badge size="small">no result</Badge>}
        </Flex>
      );
    case 'approval':
      return (
        <Flex align="center" gap="2" style={{ minWidth: 0 }}>
          <Text variant="body-medium" weight="bold">
            Approval requested
          </Text>
          {item.toolName && (
            <span className={classes.summary}>{item.toolName}</span>
          )}
          <ApprovalVerdict item={item} />
        </Flex>
      );
    default:
      return null;
  }
}

/**
 * The verdict badge on an approval.
 *
 * An undefined verdict is rendered as "awaiting a decision" rather than assumed
 * approved: the parser deliberately declines to guess when kagent used wording it
 * doesn't recognise, and claiming consent would misreport the user's own action.
 */
function ApprovalVerdict({ item }: { item: TimelineItem }) {
  if (item.kind !== 'approval') {
    return null;
  }
  if (item.verdict === 'approved') {
    return <Badge size="small">approved</Badge>;
  }
  if (item.verdict === 'rejected') {
    return <Badge size="small">rejected</Badge>;
  }
  return <Badge size="small">awaiting a decision</Badge>;
}

/**
 * One entry in the session timeline.
 *
 * Conversation messages render in full; everything else — reasoning, tool calls,
 * delegations, approvals — is collapsible, because the agent's working is what
 * makes this screen worth opening but a wall of tool payloads is unreadable.
 *
 * `defaultExpanded` only applies on mount, which is a bui `AccordionGroup`
 * constraint. The list keys each group on the global detail setting so changing it
 * remounts them and the new default takes effect.
 */
export function TimelineEntry({
  item,
  resolvedAgentName,
  defaultExpanded = false,
}: TimelineEntryProps) {
  const classes = useStyles();
  const author = authorLabel(item, resolvedAgentName);

  // Narrowed on the kinds rather than through `isCollapsible`, so the compiler
  // knows `text` exists in this branch.
  if (item.kind === 'user-message' || item.kind === 'agent-message') {
    const isUser = item.kind === 'user-message';
    return (
      <div
        className={`${classes.entry} ${isUser ? classes.userEntry : ''}`}
        data-testid={`timeline-${item.kind}`}
      >
        <Text
          variant="body-small"
          color="secondary"
          style={{ display: 'block' }}
        >
          {isUser ? 'You' : (author ?? 'Agent')}
        </Text>
        <MessageBody text={item.text} />
      </div>
    );
  }

  // Reasoning always has text to show; everything else depends on whether kagent
  // recorded any payload. An approval frequently has none — the verdict is already
  // on the summary row — and a tool call can have neither arguments nor result.
  const hasDetail = item.kind === 'reasoning' || Boolean(payloadsOf(item));

  // No expander when there is nothing behind it. An accordion that opens onto an
  // empty panel invites a click and answers with nothing.
  if (!hasDetail) {
    return (
      <div className={classes.entry} data-testid={`timeline-${item.kind}`}>
        <div className={classes.inertSummary}>
          <CollapsedSummary item={item} />
        </div>
      </div>
    );
  }

  return (
    <div className={classes.entry} data-testid={`timeline-${item.kind}`}>
      {/* `defaultExpandedKeys` on the group rather than `defaultExpanded` on the
          item: inside a DisclosureGroup react-aria owns the expanded set, so the
          per-item prop is not what takes effect. It applies on mount only, which is
          why the list keys each group on the global detail setting. */}
      <AccordionGroup
        className={classes.accordion}
        defaultExpandedKeys={defaultExpanded ? new Set([item.id]) : new Set()}
      >
        <Accordion id={item.id}>
          <AccordionTrigger>
            <CollapsedSummary item={item} />
          </AccordionTrigger>
          <AccordionPanel>
            {item.kind === 'reasoning' ? (
              <MessageBody text={item.text} />
            ) : (
              <CallDetail item={item} />
            )}
          </AccordionPanel>
        </Accordion>
      </AccordionGroup>
    </div>
  );
}
