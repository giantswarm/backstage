import {
  Agent,
  AgentConditionType,
  getAgentStatusChangedAt,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import type { AgentStatus } from './agentManager';

/**
 * How long a failure that can still resolve on its own is read as the agent
 * being set up rather than as broken.
 *
 * A new agent is several objects reconciled by several controllers: Flux
 * fetches the chart and installs the release, and the release renders the
 * Agent beside the objects it references — the RemoteMCPServer named after
 * the agent among them. Until each of those exists, kagent reports
 * `ResolvedRefs=False` (`resolve RemoteMCPServer "<agent>": not found`) and
 * helm-controller may report the release not ready, both of which clear
 * within seconds to a minute. Three minutes is comfortably past that, and the
 * same window the agent list treats as "still converging"; past it, waiting
 * longer would only hide a real failure.
 */
export const PROVISIONING_GRACE_MS = 3 * 60_000;

/** How long each step of {@link backoffRefetchInterval} lasts before the interval doubles. */
const BACKOFF_STEP_MS = 60_000;

/**
 * A refetch interval that starts at `initialMs` and doubles every minute of
 * `elapsedMs`, up to `maxMs`: quick while a change is likely, then
 * progressively less often for a state that is not moving.
 */
export function backoffRefetchInterval(
  elapsedMs: number,
  initialMs: number,
  maxMs: number,
): number {
  const doublings = Math.max(0, Math.floor(elapsedMs / BACKOFF_STEP_MS));
  return Math.min(maxMs, initialMs * 2 ** doublings);
}

/**
 * Until when a failed agent reads as being set up, as epoch milliseconds;
 * `undefined` when it does not at all.
 *
 * Only an unresolved reference qualifies: `ResolvedRefs=False` as the root
 * cause, which is what an agent whose referenced objects are still being
 * created reports. `Accepted=False` (the Harness does not run this kind of
 * agent) and `Compatible=False` (the configuration does not fit the Harness)
 * are about the spec itself, and no amount of waiting changes them, so they
 * are failures at once.
 *
 * The window runs from the agent's last status change — its creation, or the
 * edit that made a reference fail — so an agent stuck for longer than that
 * shows its failure, and a fresh one gets the whole window.
 */
export function agentSettingUpUntil(agent: Agent): number | undefined {
  if (agent.getFailure()?.condition !== AgentConditionType.ResolvedRefs) {
    return undefined;
  }
  const changedAt = getAgentStatusChangedAt(agent.jsonData);
  return changedAt === undefined
    ? undefined
    : changedAt + PROVISIONING_GRACE_MS;
}

/**
 * Whether agent-manager's `failed` verdict is one that cannot resolve by
 * waiting: a suspended or deleting release, or an Agent the Harness does not
 * accept or whose configuration does not fit it. A release not ready yet, an
 * Agent not rendered yet and unresolved references are not.
 *
 * `compatible: false` counts only while the references resolve: the
 * controller marks every stage after a failing one `False` as well, so with
 * `resolvedRefs: false` it says nothing of its own.
 */
export function isTerminalAgentStatus(status: AgentStatus): boolean {
  const { helmRelease, agent } = status;
  if (helmRelease?.suspended || helmRelease?.deleting) {
    return true;
  }
  if (agent?.accepted === false) {
    return true;
  }
  return agent?.compatible === false && agent.resolvedRefs !== false;
}
