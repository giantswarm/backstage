import {
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import type {
  ApprovalDecisionResult,
  ApprovalLookup,
  ApprovalRefusal,
  ApprovalStepView,
  ApprovalValue,
  ApprovalView,
} from '@giantswarm/backstage-plugin-muster';
import { InputBlock } from './InputBlock';

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

/**
 * How long Approve and Decline stay inert after the request, with them below
 * it, came into view on a visible page: as muster's own page, so a click
 * meant for something else, or one before the request was read, decides
 * nothing.
 */
export const ARM_AFTER_MS = 1_000;

/** Whether a value starts collapsed. */
export function isCollapsed(value: ApprovalValue): boolean {
  return value.value.length > LONG_VALUE || value.value.includes('\n');
}

/** The id of a value on the card, unique across arguments, preset and steps. */
function valueId(section: string, key: string): string {
  return `${section}\u0000${key}`;
}

function stepSection(step: ApprovalStepView): string {
  return `step:${step.workflow ?? ''}/${step.id}`;
}

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

/** An asking agent as the chat names it. */
export type AskingAgent = {
  /** The display name when the binding carries one, else `technical`. */
  name: string;
  /** `namespace/name`, the secondary detail. */
  technical: string;
  /** The display name is shown, so the technical name is secondary. */
  hasDisplayName: boolean;
};

/**
 * The asking agent differs from the session's agent (a sub-agent the
 * session's agent invoked, or another one): only then the chat names it, by
 * display name with `namespace/name` as secondary detail.
 */
export function otherAgent(
  view: ApprovalView,
  sessionAgent: SessionAgent | undefined,
): AskingAgent | undefined {
  if (!view.agent || !sessionAgent) {
    return undefined;
  }
  const sameName = view.agent.name === sessionAgent.name;
  const sameNamespace =
    !view.agent.namespace || view.agent.namespace === sessionAgent.namespace;
  if (sameName && sameNamespace) {
    return undefined;
  }
  const technical = view.agent.namespace
    ? `${view.agent.namespace}/${view.agent.name}`
    : view.agent.name;
  const displayName = view.agent.displayName?.trim();
  return {
    name: displayName || technical,
    technical,
    hasDisplayName: Boolean(displayName),
  };
}

/** `namespace/name` of the asking agent, as muster names it. */
function technicalName(agent: NonNullable<ApprovalView['agent']>): string {
  return agent.namespace ? `${agent.namespace}/${agent.name}` : agent.name;
}

/**
 * Why the card warns about the asking agent, unless muster positively names
 * this conversation's agent (same namespace and name):
 * - `other`: muster names another agent;
 * - `unnamed`: muster names no agent (a delegated token, a binding without
 *   an approval sender, a person's own call);
 * - `unverified`: muster names an agent, but not its namespace, or this
 *   conversation's agent is not known here.
 */
export type AskerNotice =
  | { kind: 'other'; asker: AskingAgent }
  | { kind: 'unnamed' }
  | { kind: 'unverified'; asker: AskingAgent };

export function askerNotice(
  view: ApprovalView,
  sessionAgent: SessionAgent | undefined,
): AskerNotice | undefined {
  if (!view.agent) {
    return { kind: 'unnamed' };
  }
  const technical = technicalName(view.agent);
  const displayName = view.agent.displayName?.trim();
  const asker = {
    name: displayName || technical,
    technical,
    hasDisplayName: Boolean(displayName),
  };
  if (!sessionAgent) {
    return { kind: 'unverified', asker };
  }
  if (view.agent.name !== sessionAgent.name) {
    return { kind: 'other', asker };
  }
  if (!view.agent.namespace) {
    return { kind: 'unverified', asker };
  }
  return view.agent.namespace === sessionAgent.namespace
    ? undefined
    : { kind: 'other', asker };
}

/**
 * Arms the decision: false until `target` has been in view, with the page
 * visible, for `delayMs` without a break; then true until `key` changes (a
 * new request, or the same one shown again after it changed). Without
 * IntersectionObserver the element counts as in view.
 */
export function useArmed(
  target: RefObject<Element>,
  key: string,
  delayMs: number,
): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(false);
    const element = target.current;
    if (!element) {
      return undefined;
    }
    let done = false;
    let inView = typeof IntersectionObserver === 'undefined';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (done) {
        return;
      }
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (inView && document.visibilityState === 'visible') {
        timer = setTimeout(() => {
          done = true;
          setArmed(true);
        }, delayMs);
      }
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(entries => {
            inView = entries.some(entry => entry.isIntersecting);
            update();
          });
    observer?.observe(element);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      done = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [target, key, delayMs]);
  return armed;
}

const useStyles = makeStyles(theme => ({
  // No inner scroll box: the card grows with the request, and Approve and
  // Decline come after all of it.
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
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
  // The text token: #009fff is only 2.9:1 on white, the text colour clears 3:1
  // in light and dark.
  headerIcon: {
    color: `var(--bui-fg-primary, ${theme.palette.text.primary})`,
  },
}));

type Opened = {
  /** Whether the collapsed value `id` was opened. */
  isOpen: (id: string) => boolean;
  /** The person opened the collapsed value `id`. */
  open: (id: string) => void;
};

function Value({
  value,
  id,
  opened,
}: {
  value: ApprovalValue;
  id: string;
  opened: Opened;
}) {
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
  if (!isCollapsed(value)) {
    return text;
  }
  // Collapsed, never cut: the summary says how much is hidden, the whole
  // value is behind "Show all". Opening it is the person's choice; Approve
  // does not wait for it.
  const open = opened.isOpen(id);
  return (
    <details
      data-testid="approval-collapsed-value"
      onToggle={event => {
        if ((event.currentTarget as HTMLDetailsElement).open) {
          opened.open(id);
        }
      }}
    >
      <summary>
        <span className={classes.code}>{value.value.slice(0, 60)}…</span>{' '}
        <Text as="span" variant="body-small" weight="bold">
          {open ? 'Showing all' : 'Show all'} {value.value.length} characters
        </Text>
        {!open && (
          <Text as="span" variant="body-small" color="secondary">
            {' '}
            ({value.value.length - 60} characters hidden)
          </Text>
        )}
      </summary>
      {text}
    </details>
  );
}

function Values({
  values,
  section,
  opened,
  testIdPrefix = 'approval-argument',
}: {
  values: ApprovalValue[];
  section: string;
  opened: Opened;
  testIdPrefix?: string;
}) {
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
          <dd data-testid={`${testIdPrefix}-${value.key}`}>
            <Value
              value={value}
              id={valueId(section, value.key)}
              opened={opened}
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AskerWarning({ notice }: { notice: AskerNotice }) {
  const classes = useStyles();
  const named = (asker: AskingAgent) => (
    <>
      <span title={asker.technical} data-testid="approval-asker-name">
        {asker.name}
      </span>
      {asker.hasDisplayName && (
        <>
          {' '}
          (<code data-testid="approval-asker-technical">{asker.technical}</code>
          )
        </>
      )}
    </>
  );
  let text;
  switch (notice.kind) {
    case 'other':
      text = (
        <>
          Asked by another agent, {named(notice.asker)}, not the agent of this
          conversation.
        </>
      );
      break;
    case 'unverified':
      text = (
        <>
          Asked by {named(notice.asker)}: the portal cannot confirm it is the
          agent of this conversation.
        </>
      );
      break;
    default:
      text = (
        <>
          muster does not know which agent asks: this request may not come from
          the agent of this conversation.
        </>
      );
  }
  return (
    <div
      className={classes.warning}
      role="note"
      data-testid={
        notice.kind === 'other'
          ? 'approval-other-agent'
          : 'approval-unconfirmed-agent'
      }
    >
      <TriangleAlert size="1.25em" aria-hidden />
      <span>{text}</span>
    </div>
  );
}

/**
 * What the request shows: everything muster's page shows and the decision's
 * digest covers, as text. A field of the view is either rendered here or
 * named in the test that guards this (`InlineApproval.test.tsx`).
 */
function RequestDetails({
  view,
  sessionAgent,
  opened,
}: {
  view: ApprovalView;
  sessionAgent?: SessionAgent;
  opened: Opened;
}) {
  const classes = useStyles();
  const notice = askerNotice(view, sessionAgent);
  const [showDetails, setShowDetails] = useState(false);
  const moreId = useId();
  return (
    <div className={classes.body} data-testid="approval-details">
      {notice && <AskerWarning notice={notice} />}
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
          <span className={classes.code}>{view.tool.name}</span>
          {view.changesData && (
            <span className={classes.tag}>Changes data</span>
          )}
        </dd>
      </dl>
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
          <Values
            values={view.preset}
            section="preset"
            opened={opened}
            testIdPrefix="approval-preset"
          />
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
                data-testid={`approval-step-${step.id}`}
              >
                <span style={step.asks ? { fontWeight: 600 } : undefined}>
                  {step.workflow && `in workflow ${step.workflow}: `}
                  {step.label} <span className={classes.code}>{step.tool}</span>
                  {step.asks && <span className={classes.tag}>Asks</span>}
                </span>
                {step.arguments && step.arguments.length > 0 && (
                  <Values
                    values={step.arguments}
                    section={stepSection(step)}
                    opened={opened}
                    testIdPrefix={`approval-step-${step.id}-argument`}
                  />
                )}
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
            input above.
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
      {/*
        Who asks and how, and the input: behind Show details,
        hidden until the person opens them. Approve does not wait for it.
      */}
      <div>
        <Button
          variant="tertiary"
          size="small"
          aria-expanded={showDetails}
          aria-controls={moreId}
          onPress={() => setShowDetails(open => !open)}
        >
          {showDetails ? 'Hide details' : 'Show details'}
        </Button>
      </div>
      {showDetails && (
        <div id={moreId} data-testid="approval-more">
          <Text as="p" variant="body-small" weight="bold">
            About this request
          </Text>
          <dl className={classes.fields} data-testid="approval-about">
            <dt>Agent</dt>
            <dd data-testid="approval-agent">
              {view.agent ? (
                <>
                  {view.agent.displayName?.trim() || technicalName(view.agent)}
                  {view.agent.displayName?.trim() && (
                    <>
                      {' '}
                      <span className={classes.code}>
                        {technicalName(view.agent)}
                      </span>
                    </>
                  )}
                </>
              ) : (
                'Not named by muster'
              )}
            </dd>
            <dt>Caller</dt>
            <dd data-testid="approval-caller-kind">{view.callerKind}</dd>
            <dt>Acts for</dt>
            <dd data-testid="approval-acts-for">
              <span
                title={`${view.actsFor.subject} at ${view.actsFor.issuer}`}
                data-testid="approval-acts-for-name"
              >
                {view.actsFor.name || view.actsFor.subject}
              </span>
            </dd>
            {view.tool.exposed && (
              <>
                <dt>Called as</dt>
                <dd className={classes.code} data-testid="approval-exposed">
                  {view.tool.exposed}
                </dd>
              </>
            )}
            <dt>Setting</dt>
            <dd data-testid="approval-setting">
              {view.why.setting} ({view.why.source})
            </dd>
            {view.session && (
              <>
                <dt>Session</dt>
                <dd className={classes.code} data-testid="approval-session">
                  {view.session}
                </dd>
              </>
            )}
            {view.client && (
              <>
                <dt>Client</dt>
                <dd className={classes.code} data-testid="approval-client">
                  {view.client}
                </dd>
              </>
            )}
            <dt>Expires</dt>
            <dd data-testid="approval-expires">
              {new Date(view.expiresAt).toLocaleString()}
            </dd>
          </dl>
          <InputBlock
            canonical={view.canonicalArguments}
            onOpen={() => opened.open(valueId('input', ''))}
          />
          <Text
            as="p"
            variant="body-small"
            color="secondary"
            className={classes.code}
            data-testid="approval-fingerprint"
          >
            Fingerprint: SHA-256 {view.argumentsHash}
          </Text>
        </div>
      )}
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
  /**
   * How long Approve and Decline stay inert once the request is in view
   * (`ARM_AFTER_MS`). Tests only.
   */
  armAfterMs?: number;
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
export function InlineApproval(props: InlineApprovalProps) {
  // One card per request: a card reused for the next approval would keep the
  // previous request's view, live buttons and "decided" mark until the new
  // one loads.
  return <InlineApprovalCard key={props.url} {...props} />;
}

function InlineApprovalCard({
  url,
  approvals,
  sessionAgent,
  onDecided,
  onUnavailable,
  isAnswering,
  armAfterMs = ARM_AFTER_MS,
}: InlineApprovalProps) {
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

  return (
    <ShownApproval
      key={state.view.digest}
      view={state.view}
      notice={state.notice}
      error={error}
      deciding={deciding}
      isAnswering={isAnswering}
      sessionAgent={sessionAgent}
      armAfterMs={armAfterMs}
      onDecide={decision => void decide(state.view, decision)}
      onContinue={finish}
    />
  );
}

/**
 * One shown view of a request. Keyed by its digest: shown again after it
 * changed, it starts unarmed with every collapsed value closed.
 */
function ShownApproval({
  view,
  notice,
  error,
  deciding,
  isAnswering,
  sessionAgent,
  armAfterMs,
  onDecide,
  onContinue,
}: {
  view: ApprovalView;
  notice?: string;
  error?: string;
  deciding?: 'approve' | 'decline';
  isAnswering: boolean;
  sessionAgent?: SessionAgent;
  armAfterMs: number;
  onDecide: (decision: 'approve' | 'decline') => void;
  onContinue: (status: 'approved' | 'declined') => void;
}) {
  const classes = useStyles();
  const actions = useRef<HTMLDivElement>(null);
  const armed = useArmed(actions, view.digest, armAfterMs);
  const [openedIds, setOpenedIds] = useState<ReadonlySet<string>>(new Set());
  const opened = useMemo<Opened>(
    () => ({
      isOpen: id => openedIds.has(id),
      open: id =>
        setOpenedIds(previous =>
          previous.has(id) ? previous : new Set([...previous, id]),
        ),
    }),
    [openedIds],
  );
  const pending = view.status === 'pending';
  const busy = Boolean(deciding) || isAnswering;
  return (
    <Flex direction="column" gap="2">
      <div className={classes.header}>
        <ShieldCheck size="1.25em" aria-hidden className={classes.headerIcon} />
        <Text as="p" variant="body-medium" weight="bold">
          {view.heading}
        </Text>
      </div>
      {notice && <Alert status="warning" description={notice} />}
      <RequestDetails view={view} sessionAgent={sessionAgent} opened={opened} />
      {error && (
        <Alert
          status="danger"
          title="Nothing was decided"
          description={error}
        />
      )}
      {pending ? (
        <Flex
          ref={actions}
          direction="column"
          gap="1"
          data-testid="approval-actions"
        >
          <Flex gap="2" style={{ flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              size="small"
              isDisabled={!armed || busy}
              onPress={() => onDecide('approve')}
            >
              {deciding === 'approve' ? 'Approving…' : 'Approve'}
            </Button>
            <Button
              variant="secondary"
              size="small"
              isDisabled={!armed || busy}
              onPress={() => onDecide('decline')}
            >
              {deciding === 'decline' ? 'Declining…' : 'Decline'}
            </Button>
          </Flex>
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
              onPress={() => onContinue(view.status as 'approved' | 'declined')}
            >
              Continue
            </Button>
          )}
        </Flex>
      )}
    </Flex>
  );
}
