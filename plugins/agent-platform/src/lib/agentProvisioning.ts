import {
  Agent,
  AgentConditionType,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import type { AgentStatus } from './agentManager';

/**
 * How long after its creation a new agent's missing reference is read as the
 * agent being set up rather than as broken — and how long the agent list keeps
 * a non-ready agent on its fast poll.
 *
 * A new agent is several objects reconciled by several controllers: Flux
 * installs the release, and the release renders the Agent beside the objects
 * it references — the RemoteMCPServer named after the agent among them. Until
 * that exists, kagent reports `ResolvedRefs=False` (`resolve RemoteMCPServer
 * "<agent>": not found`), which clears within seconds to a minute. Three
 * minutes is comfortably past that; a healthy agent converges well inside it,
 * and past it waiting longer would only hide a real failure.
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

/** A controller message about an object that does not exist (yet). */
const NOT_FOUND = /\bnot found\b/;

/**
 * Until when a failed agent reads as being set up, as epoch milliseconds;
 * `undefined` when it does not at all.
 *
 * Narrow on purpose, and closed when in doubt: only a **new** agent, and only
 * a reference to an object that does not exist yet — `ResolvedRefs=False` as
 * the root cause with a message that says `not found`, which is what an agent
 * whose release has not created the objects it uses yet reports. Every other
 * failure is shown at once: a rejected or incompatible configuration, a
 * reference that exists but does not resolve, and any failure of an agent
 * that is not new, such as an edit pointing at a ModelConfig that does not
 * exist or a server someone deleted.
 *
 * The window runs from the Agent's `creationTimestamp`, so no later condition
 * change restarts it; without one there is no window.
 */
export function agentSettingUpUntil(agent: Agent): number | undefined {
  const failure = agent.getFailure();
  if (
    failure?.condition !== AgentConditionType.ResolvedRefs ||
    !NOT_FOUND.test(failure.message ?? '')
  ) {
    return undefined;
  }
  const createdAt = Date.parse(
    agent.jsonData.metadata?.creationTimestamp ?? '',
  );
  return Number.isNaN(createdAt)
    ? undefined
    : createdAt + PROVISIONING_GRACE_MS;
}

/**
 * Whether agent-manager's verdict is the same missing reference
 * {@link agentSettingUpUntil} gives a new agent time for — for the moment
 * before the page has the Agent object itself.
 *
 * It has to say so positively: `failed`, the Agent rendered and accepted, its
 * references unresolved, a summary that says `not found`, and a release that
 * is neither suspended nor being deleted. A verdict without that breakdown,
 * or failed for any other reason, is a failure.
 */
export function isMissingReferenceStatus(status: AgentStatus): boolean {
  const { verdict, summary, agent, helmRelease } = status;
  return (
    verdict === 'failed' &&
    agent?.exists === true &&
    agent.accepted !== false &&
    agent.resolvedRefs === false &&
    !helmRelease?.suspended &&
    !helmRelease?.deleting &&
    NOT_FOUND.test(summary)
  );
}

/**
 * The reasons helm-controller gives a release that is still on its way:
 * `Progressing` while it reconciles, `DependencyNotReady` while a release it
 * depends on is not ready yet. Every other reason — `InstallFailed`,
 * `UpgradeFailed`, `ArtifactFailed`, a stall, or one not listed — is a failure.
 */
const RELEASE_PROGRESSING_REASONS: ReadonlySet<string> = new Set([
  'Progressing',
  'DependencyNotReady',
]);

/**
 * Until when a new agent's HelmRelease reads as being set up, as epoch
 * milliseconds; `undefined` when it does not at all — the release counterpart
 * of {@link agentSettingUpUntil}, for the moment before the release has
 * rendered the Agent.
 *
 * Only a release that has not reconciled yet: no `Ready` condition at all, or
 * one that is not `True` with a reason in {@link RELEASE_PROGRESSING_REASONS};
 * not suspended, and not `Stalled`. The window runs from the release's
 * `creationTimestamp`, so it covers a new release only; without one there is
 * no window.
 */
export function releaseSettingUpUntil(
  release: HelmRelease,
): number | undefined {
  if (
    release.isSuspended() ||
    release.findStatusCondition('Stalled')?.status === 'True'
  ) {
    return undefined;
  }
  const ready = release.findReadyCondition();
  if (
    ready &&
    (ready.status === 'True' || !RELEASE_PROGRESSING_REASONS.has(ready.reason))
  ) {
    return undefined;
  }
  const createdAt = Date.parse(release.getCreatedTimestamp() ?? '');
  return Number.isNaN(createdAt)
    ? undefined
    : createdAt + PROVISIONING_GRACE_MS;
}
