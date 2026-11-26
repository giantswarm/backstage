import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { ApprovalShieldIcon, ApprovalWarningIcon } from '../ApprovalIcons';
import type {
  ApprovalDecisionResult,
  ApprovalLookup,
  ApprovalRefusal,
  ApprovalValue,
  ApprovalView,
} from '@giantswarm/backstage-plugin-muster';

/** How the chat reads and decides the person's pending approvals. */
export type InlineApprovals = {
  get: (url: string) => Promise<ApprovalLookup>;
  decide: (
    url: string,
    decision: 'approve' | 'decline',
    digest: string,
  ) => Promise<ApprovalDecisionResult>;
};

/** The agent the chat talks to: the session's agent. */
export type SessionAgent = { namespace: string; name: string };

/** A value longer than this, or on several lines, starts collapsed. */
const LONG_VALUE = 160;

/** Why an approval asks, by muster's `source`, in plain words. */
const WHY: Record<string, string> = {
  tool: "the tool's own setting on this connector",
  connector: "the connector's setting for its tools",
  unreviewed: "the connector's tools have not been reviewed yet",
  agent: "this agent's setting",
  'agent-exception': "this agent's exception",
  governance: "the platform's governance (agents are asked here)",
  builtin: 'a built-in rule (this tool always asks agents)',
  unavailable: 'the approval settings could not be read, so it asks',
};

export function whyItAsks(source: string): string {
  return WHY[source] ?? `${source} setting`;
}

/** "in 4 min", "in less than a minute", "now". */
export function expiresIn(expiresAt: string, now = Date.now()): string {
  const ms = Date.parse(expiresAt) - now;
  if (Number.isNaN(ms) || ms <= 0) {
    return 'now';
  }
  const minutes = Math.floor(ms / 60_000);
  return minutes < 1 ? 'in less than a minute' : `in ${minutes} min`;
}

/**
 * The asking agent differs from the session's agent (a sub-agent the
 * session's agent invoked, or another one): only then the chat names it.
 */
export function otherAgent(
  view: ApprovalView,
  sessionAgent: SessionAgent | undefined,
): string | undefined {
  if (!view.agent || !sessionAgent) {
    return undefined;
  }
  const sameName = view.agent.name === sessionAgent.name;
  const sameNamespace =
    !view.agent.namespace || view.agent.namespace === sessionAgent.namespace;
  if (sameName && sameNamespace) {
    return undefined;
  }
  return view.agent.namespace
    ? `${view.agent.namespace}/${view.agent.name}`
    : view.agent.name;
}

const useStyles = makeStyles(theme => ({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    maxHeight: 'min(45dvh, 400px)',
    overflowY: 'auto',
    overflowWrap: 'anywhere',
  },
  fields: {
    display: 'grid',
    gridTemplateColumns: 'max-content minmax(0, 1fr)',
    columnGap: theme.spacing(1.5),
    rowGap: theme.spacing(0.5),
    margin: 0,
    '& dt': { fontWeight: 600 },
    '& dd': { margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  },
  code: {
    fontFamily: 'var(--bui-font-monospace, ui-monospace, monospace)',
    fontSize: 'var(--bui-font-size-2, 12px)',
  },
  tag: {
    display: 'inline-block',
    marginLeft: theme.spacing(1),
    padding: '0 6px',
    borderRadius: 4,
    background: 'var(--bui-warning-bg-subdued, #fff4e5)',
    color: 'var(--bui-warning-fg-subdued, #8a4b00)',
    fontSize: 'var(--bui-font-size-2, 12px)',
  },
  says: {
    margin: 0,
    padding: theme.spacing(0.75, 1),
    border: '1px solid var(--bui-border-1, #c0c0c0)',
    borderRadius: 8,
    whiteSpace: 'pre-wrap',
  },
  warning: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'flex-start',
    padding: theme.spacing(0.75, 1),
    borderRadius: 8,
    background: 'var(--bui-warning-bg-subdued, #fff4e5)',
    color: 'var(--bui-warning-fg-subdued, #8a4b00)',
    fontWeight: 600,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1.5),
    '& > svg': { marginTop: 2, flexShrink: 0 },
  },
  // Giant Swarm's vivid blue for the pictogram.
  headerIcon: { color: '#009fff' },
}));

function Value({ value }: { value: ApprovalValue }) {
  const classes = useStyles();
  const text = (
    <>
      <span className={classes.code}>{value.value}</span>
      {value.type && (
        <Text as="span" variant="body-small" color="secondary">
          {' '}
          ({value.type})
        </Text>
      )}
    </>
  );
  if (value.value.length <= LONG_VALUE && !value.value.includes('\n')) {
    return text;
  }
  return (
    <details>
      <summary>
        {value.value.slice(0, 60)}… ({value.value.length} characters)
      </summary>
      {text}
    </details>
  );
}

function Values({ values }: { values: ApprovalValue[] }) {
  const classes = useStyles();
  return (
    <dl className={classes.fields}>
      {values.map(value => (
        <div key={value.key} style={{ display: 'contents' }}>
          <dt>
            {value.label}{' '}
            <span className={classes.code} style={{ fontWeight: 400 }}>
              {value.key}
            </span>
          </dt>
          <dd data-testid={`approval-argument-${value.key}`}>
            <Value value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What the request shows: everything muster's page shows, as text. */
function RequestDetails({
  view,
  sessionAgent,
}: {
  view: ApprovalView;
  sessionAgent?: SessionAgent;
}) {
  const classes = useStyles();
  const asker = otherAgent(view, sessionAgent);
  return (
    <div className={classes.body} data-testid="approval-details">
      {asker && (
        <div
          className={classes.warning}
          role="note"
          data-testid="approval-other-agent"
        >
          <ApprovalWarningIcon />
          <span>
            Asked by another agent, {asker}, not the agent of this conversation.
          </span>
        </div>
      )}
      <Text as="p" variant="body-medium">
        {view.message}
      </Text>
      <dl className={classes.fields}>
        {view.connector && (
          <>
            <dt>Connector</dt>
            <dd data-testid="approval-connector">
              {view.connector.displayName}{' '}
              <span className={classes.code}>{view.connector.server}</span>
            </dd>
          </>
        )}
        <dt>{view.tool.kind === 'workflow' ? 'Workflow' : 'Tool'}</dt>
        <dd data-testid="approval-tool">
          {view.tool.title}{' '}
          {view.tool.kind !== 'workflow' && (
            <span className={classes.code}>{view.tool.name}</span>
          )}
          {view.changesData && (
            <span className={classes.tag}>Changes data</span>
          )}
        </dd>
      </dl>
      {view.arguments.length > 0 ? (
        <>
          <Text as="p" variant="body-small" weight="bold">
            Arguments
          </Text>
          <Values values={view.arguments} />
        </>
      ) : (
        <Text as="p" variant="body-small" color="secondary">
          No arguments.
        </Text>
      )}
      {view.changes && view.changes.length > 0 && (
        <>
          <Text as="p" variant="body-small" weight="bold">
            What changes
          </Text>
          <dl className={classes.fields}>
            {view.changes.map(change => (
              <div key={change.field} style={{ display: 'contents' }}>
                <dt>{change.field}</dt>
                <dd className={classes.code}>
                  {change.old} → {change.new}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {view.preset && view.preset.length > 0 && (
        <>
          <Text as="p" variant="body-small" weight="bold">
            Approval settings written
          </Text>
          <Values values={view.preset} />
        </>
      )}
      {view.steps && view.steps.length > 0 && (
        <>
          <Text as="p" variant="body-small" weight="bold">
            Steps
          </Text>
          <ol style={{ margin: 0 }}>
            {view.steps.map(step => (
              <li
                key={`${step.workflow ?? ''}/${step.id}`}
                style={step.asks ? { fontWeight: 600 } : undefined}
              >
                {step.workflow && `in workflow ${step.workflow}: `}
                {step.label} <span className={classes.code}>{step.tool}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {view.agentSays && (
        <div data-testid="approval-agent-says">
          <Text as="p" variant="body-small" weight="bold">
            Agent says
          </Text>
          <blockquote className={classes.says}>{view.agentSays}</blockquote>
          <Text as="p" variant="body-small" color="secondary">
            The agent's own words: they decide nothing. Check the tool and its
            arguments above.
          </Text>
        </div>
      )}
      <Text
        as="p"
        variant="body-small"
        color="secondary"
        data-testid="approval-why"
      >
        Asks because of {whyItAsks(view.why.source)} · Expires{' '}
        {expiresIn(view.expiresAt)}
        {view.installation ? ` · ${view.installation}` : ''}
      </Text>
      <details>
        <summary>
          <Text as="span" variant="body-small" color="secondary">
            Show details
          </Text>
        </summary>
        <pre
          className={classes.code}
          style={{ whiteSpace: 'pre-wrap', margin: 0 }}
        >
          {view.canonicalArguments}
        </pre>
        <Text as="p" variant="body-small" color="secondary">
          SHA-256 {view.argumentsHash}
        </Text>
      </details>
    </div>
  );
}

export type InlineApprovalProps = {
  /** The approval page muster's elicitation links to. */
  url: string;
  approvals: InlineApprovals;
  sessionAgent?: SessionAgent;
  /**
   * The request is decided (here, or already elsewhere): the chat answers
   * the elicitation so the agent goes on.
   */
  onDecided: (status: 'approved' | 'declined') => void;
  /** muster shows nothing here (not trusted, unreachable, ...). */
  onUnavailable?: (refusal: ApprovalRefusal) => void;
  /** Whether the chat is sending an answer now. */
  isAnswering: boolean;
};

type State =
  | { phase: 'loading' }
  | { phase: 'shown'; view: ApprovalView; notice?: string }
  | { phase: 'refused'; refusal: ApprovalRefusal };

/**
 * A pending approval of muster, shown in the chat with everything muster's
 * page shows, and Approve / Decline. Only the person's click decides: the
 * decision goes to muster with the person's token and the digest of exactly
 * what is shown here, and muster refuses it if the request is not that one.
 */
export function InlineApproval({
  url,
  approvals,
  sessionAgent,
  onDecided,
  onUnavailable,
  isAnswering,
}: InlineApprovalProps) {
  const classes = useStyles();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [deciding, setDeciding] = useState<'approve' | 'decline'>();
  const [error, setError] = useState<string>();
  const decided = useRef(false);
  const latest = useRef({ onDecided, onUnavailable });
  latest.current = { onDecided, onUnavailable };

  const finish = useCallback((status: 'approved' | 'declined') => {
    if (decided.current) {
      return;
    }
    decided.current = true;
    latest.current.onDecided(status);
  }, []);

  const load = useCallback(
    async (notice?: string) => {
      try {
        const lookup = await approvals.get(url);
        if ('view' in lookup) {
          setState({ phase: 'shown', view: lookup.view, notice });
          return;
        }
        setState({ phase: 'refused', refusal: lookup.refusal });
        latest.current.onUnavailable?.(lookup.refusal);
      } catch (e) {
        const refusal = {
          status: 0,
          error: 'unreachable',
          message:
            e instanceof Error ? e.message : 'The request could not be read.',
        };
        setState({ phase: 'refused', refusal });
        latest.current.onUnavailable?.(refusal);
      }
    },
    [approvals, url],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Back from muster's page in another tab: show what stands now.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !decided.current) {
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const decide = async (
    view: ApprovalView,
    decision: 'approve' | 'decline',
  ) => {
    setDeciding(decision);
    setError(undefined);
    try {
      const result = await approvals.decide(url, decision, view.digest);
      if ('status' in result) {
        finish(result.status);
        return;
      }
      const { refusal } = result;
      if (
        refusal.error === 'decided' &&
        (refusal.decided === 'approved' || refusal.decided === 'declined')
      ) {
        // Decided meanwhile (on muster's page): the chat goes on with what
        // stands, which the person's click asked for.
        finish(refusal.decided);
        return;
      }
      if (refusal.error === 'changed') {
        await load(
          'The request is not the one shown before. Check it again before you decide.',
        );
        return;
      }
      setError(refusal.message);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'The decision could not be sent.',
      );
    } finally {
      setDeciding(undefined);
    }
  };

  if (state.phase === 'loading') {
    return (
      <Text as="p" variant="body-small" color="secondary" role="status">
        Loading the request…
      </Text>
    );
  }
  if (state.phase === 'refused') {
    return (
      <Alert
        status={state.refusal.error === 'foreign' ? 'danger' : 'warning'}
        title={
          state.refusal.error === 'foreign'
            ? 'This request is someone else’s'
            : 'The request can’t be shown here'
        }
        description={state.refusal.message}
        data-testid="approval-refused"
      />
    );
  }

  const { view, notice } = state;
  const pending = view.status === 'pending';
  return (
    <Flex direction="column" gap="2">
      <div className={classes.header}>
        <ApprovalShieldIcon className={classes.headerIcon} />
        <Text as="p" variant="body-medium" weight="bold">
          {view.heading}
        </Text>
      </div>
      {notice && <Alert status="warning" description={notice} />}
      {error && (
        <Alert
          status="danger"
          title="Nothing was decided"
          description={error}
        />
      )}
      <RequestDetails view={view} sessionAgent={sessionAgent} />
      {pending ? (
        <Flex gap="2" style={{ flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            size="small"
            isDisabled={Boolean(deciding) || isAnswering}
            onPress={() => void decide(view, 'approve')}
          >
            {deciding === 'approve' ? 'Approving…' : 'Approve'}
          </Button>
          <Button
            variant="secondary"
            size="small"
            isDisabled={Boolean(deciding) || isAnswering}
            onPress={() => void decide(view, 'decline')}
          >
            {deciding === 'decline' ? 'Declining…' : 'Decline'}
          </Button>
        </Flex>
      ) : (
        <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
          <Text as="p" variant="body-small" role="status">
            This request was already {view.status}.
          </Text>
          {(view.status === 'approved' || view.status === 'declined') && (
            <Button
              variant="primary"
              size="small"
              isDisabled={isAnswering}
              onPress={() => finish(view.status as 'approved' | 'declined')}
            >
              Continue
            </Button>
          )}
        </Flex>
      )}
    </Flex>
  );
}
