import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Checkbox, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import {
  HelmRelease,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import {
  useAgentManagerAvailability,
  useAgentManagerInfo,
} from '../../hooks/useAgentManager';
import {
  useAgentManagerAgent,
  type AgentManagerAgentState,
} from '../../hooks/useAgentManagerAgent';
import { classifyCreateFailure } from '../../hooks/useCreateAgent';
import {
  useUpdateAgent,
  type UpdateAgentState,
} from '../../hooks/useUpdateAgent';
import type { MusterServerPresence } from '../../hooks/useMusterServerAvailability';
import { agentManagerBlocker, type AgentUpdate } from '../../lib/agentManager';
import { shortCommit } from '../../lib/skills';
import type { AgentRow } from '../AgentsDataProvider';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { ShowMore, USED_BY_ROWS } from '../ShowMore';

/** An agent using the skill at a commit other than the catalog's head. */
export type BehindAgent = { row: AgentRow; pinned: string };

/**
 * Whether, and how, the person can update one agent from here — the same gate
 * Agent detail's write actions use (`agentWriteMode`), plus the apiserver's
 * answer for a live write, so an agent the person may not change is listed
 * with the reason instead of failing on confirm.
 */
export type UpdateVerdict =
  | { kind: 'checking' }
  | { kind: 'apply' }
  | { kind: 'commit' }
  | {
      kind: 'blocked';
      reason: string;
      /** muster's words, when the person's session must connect first. */
      connect?: string;
    };

/** What happened to one agent after confirming. */
export type UpdateOutcome =
  | { kind: 'updated' }
  | { kind: 'proposed'; pullRequest?: string }
  | { kind: 'failed'; message: string };

/** How many agents are written at once: a handful, not the whole fleet. */
const CONCURRENCY = 3;

/**
 * One agent's verdict from what was read about it. Pure, so the order of the
 * checks is testable on its own: whether agent-manager is reachable at all,
 * whether the person's muster session is connected to it, whether the agent
 * is applied from git (then a pull request, when agent-manager can open one),
 * and finally whether the apiserver lets the person update its HelmRelease —
 * the object agent-manager writes as them.
 */
export function updateVerdictOf({
  installation,
  namespace,
  isUnavailable,
  presence,
  isPresenceLoading,
  read,
  canCommit,
  isInfoLoading,
  mayUpdate,
  isCheckingPermission,
}: {
  installation: string;
  namespace: string;
  isUnavailable: boolean;
  presence: MusterServerPresence;
  isPresenceLoading: boolean;
  read: AgentManagerAgentState;
  canCommit: boolean;
  isInfoLoading: boolean;
  mayUpdate: boolean;
  isCheckingPermission: boolean;
}): UpdateVerdict {
  if (isUnavailable) {
    return {
      kind: 'blocked',
      reason:
        'Updates go through agent-manager over muster, and this portal has no muster plugin.',
    };
  }
  const blocker = agentManagerBlocker(presence, installation);
  if (blocker) {
    return { kind: 'blocked', reason: blocker };
  }
  if (presence === 'unknown') {
    return isPresenceLoading
      ? { kind: 'checking' }
      : {
          kind: 'blocked',
          reason: `Could not read which connectors ${installation} offers.`,
        };
  }
  if (read.isLoading) {
    return { kind: 'checking' };
  }
  if (read.failure?.kind === 'not-connected') {
    return {
      kind: 'blocked',
      reason: `Your muster session on ${installation} is not connected to agent-manager yet.`,
      connect: read.failure.message,
    };
  }
  if (read.agent?.managed === 'gitops') {
    if (isInfoLoading) {
      return { kind: 'checking' };
    }
    return canCommit
      ? { kind: 'commit' }
      : {
          kind: 'blocked',
          reason: `It is applied from git, and agent-manager on ${installation} cannot open pull requests, so update it in its GitOps repository.`,
        };
  }
  // A read that settled without an answer (refused, unreachable) leaves the
  // update offered, as on Agent detail: agent-manager then answers on confirm.
  if (isCheckingPermission) {
    return { kind: 'checking' };
  }
  if (!mayUpdate) {
    return {
      kind: 'blocked',
      reason: `You may not update agents in ${namespace} on ${installation}.`,
    };
  }
  return { kind: 'apply' };
}

function sameVerdict(a: UpdateVerdict | undefined, b: UpdateVerdict) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Reads what decides one agent's verdict and reports it up. Renders nothing:
 * the list is windowed, and "update all" must know every agent's verdict, not
 * only the shown ones'.
 */
function VerdictProbe({
  agent,
  isUnavailable,
  presence,
  isPresenceLoading,
  onVerdict,
}: {
  agent: AgentRow;
  isUnavailable: boolean;
  presence: MusterServerPresence;
  isPresenceLoading: boolean;
  onVerdict: (id: string, verdict: UpdateVerdict) => void;
}) {
  const reachable = !isUnavailable && presence === 'available';
  const read = useAgentManagerAgent(
    agent.installation,
    agent.namespace,
    agent.technicalName,
    { enabled: reachable },
  );
  const { info, isLoading: isInfoLoading } = useAgentManagerInfo(
    reachable ? agent.installation : undefined,
  );
  const release = read.agent?.helmRelease;
  const isGitOps = read.agent?.managed === 'gitops';
  const { allowed: mayUpdate, isLoading: isCheckingPermission } =
    useSelfSubjectAccessReview(
      agent.installation,
      {
        group: HelmRelease.group,
        resource: HelmRelease.plural,
        namespace: release?.namespace ?? agent.namespace,
        // Named, so a grant restricted via `resourceNames` answers accurately.
        name: release?.name ?? agent.technicalName,
        verb: 'update',
      },
      { enabled: reachable && !read.isLoading && !isGitOps },
    );

  const verdict = updateVerdictOf({
    installation: agent.installation,
    namespace: agent.namespace,
    isUnavailable,
    presence,
    isPresenceLoading,
    read,
    canCommit: info?.capabilities?.commit === true,
    isInfoLoading,
    mayUpdate,
    isCheckingPermission,
  });
  const key = JSON.stringify(verdict);
  useEffect(() => {
    onVerdict(agent.id, JSON.parse(key) as UpdateVerdict);
  }, [agent.id, key, onVerdict]);
  return null;
}

/**
 * Holds one installation's `useUpdateAgent` — the write behind Agent detail's
 * Update skills, reporting `AgentPlatform.agentUpdated` with
 * `change: 'skillsRefreshed'` — and hands it to the dialog. Renders nothing.
 */
function InstallationRunner({
  installation,
  onReady,
}: {
  installation: string;
  onReady: (installation: string, updating: UpdateAgentState) => void;
}) {
  const updating = useUpdateAgent(installation);
  useEffect(() => {
    onReady(installation, updating);
  }, [installation, updating, onReady]);
  return null;
}

/** Runs `work` over `items`, at most `limit` at a time. */
async function inPool<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (next < items.length) {
        const item = items[next++];
        await work(item);
      }
    })(),
  );
  await Promise.all(lanes);
}

const useStyles = makeStyles({
  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-3)',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-1)',
    paddingBottom: 'var(--bui-space-3)',
    borderBottom: '1px solid var(--bui-border)',
  },
  detail: {
    // Under the checkbox's label, not under the box.
    paddingLeft: 'var(--bui-space-6)',
  },
  code: {
    fontFamily: 'monospace',
  },
});

function outcomeLine(outcome: UpdateOutcome) {
  if (outcome.kind === 'updated') {
    return (
      <Text variant="body-small" color="success">
        Updated — its Harness compiles a new revision.
      </Text>
    );
  }
  if (outcome.kind === 'proposed') {
    return (
      <Text variant="body-small" color="success">
        Pull request opened
        {outcome.pullRequest ? (
          <>
            {': '}
            <Link
              href={outcome.pullRequest}
              target="_blank"
              rel="noopener noreferrer"
              variant="body-small"
            >
              {outcome.pullRequest}
            </Link>
          </>
        ) : (
          '.'
        )}{' '}
        The agent moves once it is merged.
      </Text>
    );
  }
  return (
    <Text variant="body-small" color="danger">
      Not updated: {outcome.message}
    </Text>
  );
}

function AgentLine({
  behind,
  head,
  verdict,
  outcome,
  isSelected,
  isLocked,
  onToggle,
}: {
  behind: BehindAgent;
  head: string;
  verdict: UpdateVerdict;
  outcome: UpdateOutcome | undefined;
  isSelected: boolean;
  isLocked: boolean;
  onToggle: (id: string, selected: boolean) => void;
}) {
  const classes = useStyles();
  const { row, pinned } = behind;
  const updatable = verdict.kind === 'apply' || verdict.kind === 'commit';

  let note: string | undefined;
  if (verdict.kind === 'checking') {
    note = 'Checking whether you can update it…';
  } else if (verdict.kind === 'blocked') {
    note = verdict.reason;
  } else if (verdict.kind === 'commit') {
    note =
      'It is applied from git, so it is updated through a pull request in its GitOps repository.';
  }

  return (
    <li className={classes.row} data-testid={`behind-agent-${row.id}`}>
      <Checkbox
        isSelected={isSelected}
        isDisabled={!updatable || isLocked || outcome !== undefined}
        onChange={selected => onToggle(row.id, selected)}
      >
        {row.name}
      </Checkbox>
      <Flex direction="column" gap="1" className={classes.detail}>
        <Text variant="body-small" color="secondary">
          {row.installation} · {row.namespace} ·{' '}
          <span className={classes.code} title={pinned}>
            {shortCommit(pinned)}
          </span>
          {' → '}
          <span className={classes.code} title={head}>
            {shortCommit(head)}
          </span>
        </Text>
        {note && (
          <Text variant="body-small" color="secondary">
            {note}
          </Text>
        )}
        {outcome && outcomeLine(outcome)}
      </Flex>
    </li>
  );
}

export type SkillUpdateAgentsDialogProps = {
  skillName: string;
  /** The catalog's head commit for the skill: what the agents move to. */
  head: string;
  /** The agents behind, as the page saw them when the dialog opened. */
  behind: BehindAgent[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

/**
 * "Update agents" on a skill's page: moves the agents that pin the skill at an
 * older commit to the newest one, through the machinery behind Agent detail's
 * "Update skills" — `update_agent` with `refreshSkills`, per agent, as the
 * person. That re-pins every git skill of an agent to its repository's
 * default-branch head (agent-manager has no single-skill refresh), which the
 * dialog says before anyone confirms.
 *
 * Every agent is listed with its old → new commit and is selected when the
 * person can update it: live (`apply`), or, for an agent applied from git
 * where agent-manager can commit, as a pull request in its GitOps repository.
 * The others are listed unselectable with the reason — no agent-manager, a
 * muster session to connect, no pull-request capability, or the apiserver's
 * refusal to let the person update the agent's HelmRelease. After confirming,
 * each row says what happened to it; the dialog then only closes.
 */
export function SkillUpdateAgentsDialog({
  skillName,
  head,
  behind,
  isOpen,
  onOpenChange,
}: SkillUpdateAgentsDialogProps) {
  const classes = useStyles();
  const installations = useMemo(
    () => [...new Set(behind.map(({ row }) => row.installation))].sort(),
    [behind],
  );
  const availability = useAgentManagerAvailability(installations);

  const [verdicts, setVerdicts] = useState<Record<string, UpdateVerdict>>({});
  const onVerdict = useCallback((id: string, verdict: UpdateVerdict) => {
    setVerdicts(previous =>
      sameVerdict(previous[id], verdict)
        ? previous
        : { ...previous, [id]: verdict },
    );
  }, []);

  const runners = useRef(new Map<string, UpdateAgentState>());
  const onRunnerReady = useCallback(
    (installation: string, updating: UpdateAgentState) => {
      runners.current.set(installation, updating);
    },
    [],
  );

  // Selected unless the person unticked it: "all" is the default.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<Record<string, UpdateOutcome>>({});
  const [isRunning, setRunning] = useState(false);
  const [isDone, setDone] = useState(false);

  const verdictOf = (id: string): UpdateVerdict =>
    verdicts[id] ?? { kind: 'checking' };
  const isUpdatable = (id: string) => {
    const kind = verdictOf(id).kind;
    return kind === 'apply' || kind === 'commit';
  };
  const updatable = behind.filter(({ row }) => isUpdatable(row.id));
  const selected = updatable.filter(({ row }) => !deselected.has(row.id));
  const isChecking = behind.some(
    ({ row }) => verdictOf(row.id).kind === 'checking',
  );
  const proposing = selected.filter(
    ({ row }) => verdictOf(row.id).kind === 'commit',
  ).length;
  const connectAlerts = installations.flatMap(installation => {
    const blocked = behind
      .map(({ row }) =>
        row.installation === installation ? verdicts[row.id] : undefined,
      )
      .find(verdict => verdict?.kind === 'blocked' && verdict.connect);
    return blocked?.kind === 'blocked' && blocked.connect
      ? [{ installation, message: blocked.connect }]
      : [];
  });

  const toggle = useCallback((id: string, isSelected: boolean) => {
    setDeselected(previous => {
      const next = new Set(previous);
      if (isSelected) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  const toggleAll = (isSelected: boolean) => {
    setDeselected(
      isSelected ? new Set() : new Set(updatable.map(({ row }) => row.id)),
    );
  };

  const onConfirm = async () => {
    if (selected.length === 0 || isRunning) {
      return;
    }
    setRunning(true);
    const work = selected.map(({ row }) => ({
      row,
      verdict: verdictOf(row.id),
    }));
    await inPool(work, CONCURRENCY, async ({ row, verdict }) => {
      const updating = runners.current.get(row.installation);
      const update: AgentUpdate = {
        namespace: row.namespace,
        name: row.technicalName,
        refreshSkills: true,
      };
      let outcome: UpdateOutcome;
      try {
        if (!updating) {
          throw new Error('agent-manager is not ready on this installation.');
        }
        if (verdict.kind === 'commit') {
          const result = await updating.commit(update);
          outcome = {
            kind: 'proposed',
            pullRequest: result.commit?.pullRequest,
          };
        } else {
          await updating.update(update);
          outcome = { kind: 'updated' };
        }
      } catch (error) {
        outcome = {
          kind: 'failed',
          message: classifyCreateFailure(error).message,
        };
      }
      setOutcomes(previous => ({ ...previous, [row.id]: outcome }));
    });
    setRunning(false);
    setDone(true);
  };

  const outcomeList = Object.values(outcomes);
  const updatedCount = outcomeList.filter(o => o.kind === 'updated').length;
  const proposedCount = outcomeList.filter(o => o.kind === 'proposed').length;
  const failedCount = outcomeList.filter(o => o.kind === 'failed').length;
  const summary = [
    updatedCount > 0 &&
      `${updatedCount} ${updatedCount === 1 ? 'agent' : 'agents'} updated`,
    proposedCount > 0 &&
      `${proposedCount} pull ${proposedCount === 1 ? 'request' : 'requests'} opened`,
    failedCount > 0 && `${failedCount} not updated`,
  ]
    .filter(Boolean)
    .join(', ');

  const allSelected =
    updatable.length > 0 && selected.length === updatable.length;
  const count = selected.length;

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Update the agents using "${skillName}"?`}
      confirmLabel={
        count === 0
          ? 'Update agents'
          : `Update ${count} ${count === 1 ? 'agent' : 'agents'}`
      }
      busyLabel="Updating…"
      isBusy={isRunning}
      isConfirmDisabled={count === 0 || isChecking}
      isDone={isDone}
      onConfirm={onConfirm}
      width="min(90vw, 640px)"
    >
      {installations.map(installation => (
        <InstallationRunner
          key={installation}
          installation={installation}
          onReady={onRunnerReady}
        />
      ))}
      {behind.map(({ row }) => (
        <VerdictProbe
          key={row.id}
          agent={row}
          isUnavailable={availability.isUnavailable}
          presence={availability.presenceOf(row.installation)}
          isPresenceLoading={availability.isLoading}
          onVerdict={onVerdict}
        />
      ))}
      <Flex direction="column" gap="3">
        <Text as="p" variant="body-medium" style={{ margin: 0 }}>
          {behind.length === 1 ? 'This agent pins' : 'These agents pin'} the
          skill at an older commit than the newest one,{' '}
          <span className={classes.code} title={head}>
            {shortCommit(head)}
          </span>
          . Updating an agent re-pins every git skill it mounts — this one and
          any others — to the head of its repository's default branch; nothing
          else about the agent changes.
        </Text>
        {proposing > 0 && !isDone && (
          <Text as="p" variant="body-small" color="secondary">
            {proposing === 1
              ? 'One selected agent is applied from git: it is updated through a pull request in its GitOps repository and moves once that is merged.'
              : `${proposing} selected agents are applied from git: they are updated through pull requests in their GitOps repositories and move once those are merged.`}
          </Text>
        )}
        {connectAlerts.map(({ installation, message }) => (
          <ConnectAgentManagerAlert
            key={installation}
            installation={installation}
            message={message}
            action="Agents are updated"
          />
        ))}
        {updatable.length > 1 && !isDone && (
          <Checkbox
            isSelected={allSelected}
            isIndeterminate={!allSelected && selected.length > 0}
            isDisabled={isRunning}
            onChange={toggleAll}
          >
            {`All agents you can update (${updatable.length})`}
          </Checkbox>
        )}
        <ShowMore items={behind} initial={USED_BY_ROWS} noun="agent">
          {shown => (
            <ul className={classes.rows} aria-label="Agents to update">
              {shown.map(item => (
                <AgentLine
                  key={item.row.id}
                  behind={item}
                  head={head}
                  verdict={verdictOf(item.row.id)}
                  outcome={outcomes[item.row.id]}
                  isSelected={
                    isUpdatable(item.row.id) && !deselected.has(item.row.id)
                  }
                  isLocked={isRunning || isDone}
                  onToggle={toggle}
                />
              ))}
            </ul>
          )}
        </ShowMore>
        {isChecking && !isDone && (
          <Text as="p" variant="body-small" color="secondary">
            Checking which agents you can update…
          </Text>
        )}
        {isDone && summary && (
          <Text as="p" variant="body-small" weight="bold">
            {summary}.
          </Text>
        )}
      </Flex>
    </ConfirmDialog>
  );
}
