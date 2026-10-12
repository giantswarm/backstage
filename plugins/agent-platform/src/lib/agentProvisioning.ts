import {
  Agent,
  AgentConditionType,
  type AgentReadiness,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * How long after its creation a new agent may read as being set up rather
 * than as broken — and how long the agent views keep a non-ready agent on
 * their fast poll.
 *
 * A new agent is several objects reconciled by several controllers: Flux
 * fetches the chart and installs the release, and the release renders the
 * Agent beside the RemoteMCPServer named after the agent that carries its
 * tools. Until each is there, helm-controller reports the release not ready
 * and kagent reports `ResolvedRefs=False` (`resolve RemoteMCPServer "<agent>":
 * not found`); both clear within seconds to a minute. Three minutes is
 * comfortably past that; past it, waiting longer would only hide a real
 * failure.
 *
 * A stopgap until agent-manager reports `progressing` for this
 * (giantswarm/agent-manager#145); then this module goes.
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
 * Whether a controller message says that the agent's own gateway carrier —
 * the RemoteMCPServer its release renders, named after the agent — does not
 * exist yet, and nothing else: the whole message is `resolve RemoteMCPServer
 * "<name>": not found`, the name bare or namespaced. A message that also, or
 * only, names any other missing reference (a ModelConfig, a Secret, another
 * server) is not one the release creates, so it is a failure.
 */
export function isOwnCarrierMissing(
  message: string | undefined,
  namespace: string | undefined,
  name: string,
): boolean {
  const text = message?.trim();
  return (
    text === `resolve RemoteMCPServer "${name}": not found` ||
    (namespace !== undefined &&
      text === `resolve RemoteMCPServer "${namespace}/${name}": not found`)
  );
}

/**
 * The reasons helm-controller gives a release that is still on its way:
 * `Progressing` while it reconciles, `DependencyNotReady` while a release it
 * depends on is not ready yet, and `SourceNotReady` or `ArtifactFailed` while
 * the chart source it is applied together with has not fetched the chart yet.
 * Every other reason — `InstallFailed`, `UpgradeFailed`, a stall, or one not
 * listed — is a failure.
 */
const RELEASE_SETTLING_REASONS: ReadonlySet<string> = new Set([
  'Progressing',
  'DependencyNotReady',
  'SourceNotReady',
  'ArtifactFailed',
]);

/** What one part of a new agent says about it: fine, on its way, or failed. */
type PartState = 'ok' | 'settling' | 'failed';

function releaseState(release: HelmRelease): PartState {
  if (release.isSuspended() || release.isStalled()) {
    return 'failed';
  }
  const ready = release.findReadyCondition();
  if (!ready) {
    return 'settling';
  }
  if (ready.status === 'True') {
    return 'ok';
  }
  return RELEASE_SETTLING_REASONS.has(ready.reason) ? 'settling' : 'failed';
}

function agentState(agent: Agent): PartState {
  if (agent.getReadiness() !== 'failed') {
    return 'ok';
  }
  const failure = agent.getFailure();
  return failure?.condition === AgentConditionType.ResolvedRefs &&
    isOwnCarrierMissing(failure.message, agent.getNamespace(), agent.getName())
    ? 'settling'
    : 'failed';
}

/** What is known about a new agent: its Agent, its HelmRelease, or both. */
export type ProvisioningParts = {
  agent?: Agent;
  release?: HelmRelease;
};

/**
 * Until when an agent reads as being set up, as epoch milliseconds on the
 * server's clock; `undefined` when it does not at all. **The** definition:
 * every view decides "setting up" with it.
 *
 * Narrow on purpose, and closed when in doubt. Of the parts at hand, none may
 * have failed and one must still be on its way:
 *
 * - the HelmRelease has no `Ready` condition yet, or one that is not `True`
 *   for a reason in {@link RELEASE_SETTLING_REASONS}, and is neither suspended
 *   nor stalled;
 * - the Agent fails only on its own gateway carrier ({@link isOwnCarrierMissing}).
 *
 * Any other failure of either part is shown at once. And only while the agent
 * is new: the window is {@link PROVISIONING_GRACE_MS} from the earliest
 * `creationTimestamp` at hand (the release's, normally), so no later change
 * restarts it, and without one there is no window.
 */
export function settingUpUntil({
  agent,
  release,
}: ProvisioningParts): number | undefined {
  const states = [
    ...(release ? [releaseState(release)] : []),
    ...(agent ? [agentState(agent)] : []),
  ];
  if (states.includes('failed') || !states.includes('settling')) {
    return undefined;
  }
  const created = [agent, release]
    .map(part => Date.parse(part?.getCreatedTimestamp() ?? ''))
    .filter(time => !Number.isNaN(time));
  return created.length > 0
    ? Math.min(...created) + PROVISIONING_GRACE_MS
    : undefined;
}

/**
 * An agent's readiness as every view shows it: the controller's verdict
 * (`deriveAgentReadiness`), except that a failed agent still being set up
 * ({@link settingUpUntil}) is `settingUp`.
 */
export type AgentDisplayReadiness = AgentReadiness | 'settingUp';

/** What an agent being set up says in place of its controller's failure message. */
export const SETTING_UP_MESSAGE =
  'The agent is still being set up: its tool server is being created.';

/** {@link AgentDisplayReadiness} for an agent the caller has judged. */
export function displayReadinessOf(
  agent: Agent,
  isSettingUp: boolean,
): AgentDisplayReadiness {
  const readiness = agent.getReadiness();
  return isSettingUp && readiness === 'failed' ? 'settingUp' : readiness;
}
