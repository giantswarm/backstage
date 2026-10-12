import { useState } from 'react';
import { Alert } from '@backstage/ui';

import {
  useAgentCreatedHandoff,
  type AgentCreatedHandoff,
  type AgentWriteAction,
} from '../../hooks/useAgentCreatedHandoff';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import { useServerClock } from '../../hooks/useServerClock';
import { hasReachedWrittenRevision } from '../../lib/agentManager';
import type { AgentStatus } from '../../lib/agentManager';

/** The Harness the Agent names, once the release has rendered it. */
function harnessOf(status: AgentStatus | undefined): string | undefined {
  return status?.agent?.harness;
}

/**
 * How each write is named while it converges: what agent-manager did (the
 * release was applied, updated, its skills re-pinned), what it is doing from
 * the person's point of view, and the past participle for the outcome.
 */
const WORDING: Record<
  AgentWriteAction,
  { wrote: string; doing: string; done: string; failedTitle: string }
> = {
  created: {
    wrote: 'applied the release',
    doing: 'Deploying…',
    done: 'Created',
    failedTitle: 'The agent did not become ready',
  },
  updated: {
    wrote: 'updated the release',
    doing: 'Saving…',
    done: 'Saved',
    failedTitle: 'The updated agent did not become ready',
  },
  'skills-updated': {
    wrote: 're-pinned the skills',
    doing: 'Updating skills…',
    done: 'Skills updated',
    failedTitle: 'The agent did not become ready with its updated skills',
  },
};

/**
 * What the page's own Agent read says about the agent, which decides how a
 * `failed` verdict is shown: the page judges "still being set up" on one
 * clock, so this alert, the header and the session blocker agree.
 */
type AgentReadState = {
  /**
   * Set when the Agent read finds the agent ready: the Agent's
   * `metadata.generation` and when its `Ready` condition last turned (epoch
   * milliseconds, server time) — what tells whether that "ready" is this
   * write's or left over from before it.
   */
  agentReady?: { generation?: number; since?: number };
  /** The page reads the agent as still being set up (`settingUpUntil`). */
  isSettingUp: boolean;
};

/**
 * The polling half, mounted only for the agent that was just written: the
 * verdict from agent-manager's `get_agent_status`, re-read until the platform
 * Harness reports `ready` or `failed`.
 */
function CreatedAgentVerdict({
  handoff,
  agentReady,
  isSettingUp,
}: { handoff: AgentCreatedHandoff } & AgentReadState) {
  const {
    installation,
    namespace,
    name,
    requestedBy,
    action = 'created',
    fromGeneration,
    watchId,
  } = handoff;
  // Scoped to the write: the verdict counts once the Agent's generation has
  // moved past what it was before it, so an agent that was already `ready` is
  // not reported as done before the Harness has compiled anything.
  // A `failed` verdict on an agent still being set up — its release still
  // reconciling, its own tool server not created yet — is re-read until the
  // page stops calling it that.
  const { status, isSettling, error } = useAgentStatus(
    installation,
    namespace,
    name,
    { fromGeneration, watchId, keepReadingFailed: isSettingUp },
  );
  // When this alert started following the write, on the server's clock, to
  // compare with when the Agent's `Ready` condition last turned.
  const now = useServerClock();
  const [watchedSince] = useState(now);

  const wording = WORDING[action];
  const as = requestedBy ? ` as ${requestedBy}` : '';

  if (error) {
    return (
      <Alert
        status="warning"
        title={`${wording.done}, but could not read the agent's readiness`}
        description={`agent-manager ${wording.wrote}${as}. ${error.message}`}
      />
    );
  }

  if (isSettling) {
    // Only the summary of the revision being waited on is worth showing. While
    // the status still describes the one before the write, its summary is about
    // something else: "Agent is Ready" under a "Saving…" title is the
    // very message this is meant not to show yet, and a previous revision that
    // failed would put an unrelated failure reason under it for as long as the
    // new one takes to compile.
    const describesThisWrite = hasReachedWrittenRevision(
      status,
      fromGeneration,
    );
    return (
      <Alert
        status="info"
        title={wording.doing}
        description={
          (describesThisWrite ? status?.summary : undefined) ??
          `agent-manager ${wording.wrote}${as}; waiting for its Harness to compile the agent.`
        }
      />
    );
  }

  const isFailed = status?.verdict === 'failed';

  if (isFailed && isSettingUp) {
    // A new agent's reference to an object not created yet. Its summary reads
    // as a failure, so it is not shown; once the grace period is over the
    // page stops calling it setting up, and it is shown below as one.
    return (
      <Alert
        status="info"
        title={wording.doing}
        description={`agent-manager ${wording.wrote}${as}; the agent is still being set up.`}
      />
    );
  }

  // A `failed` verdict that is not being re-read can go stale; the page's
  // Agent read goes on polling, so a failure that clears still turns this
  // alert Ready — once that "ready" is this write's. Right after an update the
  // read can still hold the ready Agent from before it, so it counts when the
  // Agent's generation has moved past the write's, or when its `Ready` turned
  // since the write: the cause fixed elsewhere, on a write that changed nothing
  // the generation counts.
  const isReadyAfterWrite =
    agentReady !== undefined &&
    (fromGeneration === undefined ||
      (agentReady.generation !== undefined &&
        agentReady.generation > fromGeneration) ||
      (agentReady.since !== undefined && agentReady.since >= watchedSince));
  if (status?.verdict === 'ready' || (isFailed && isReadyAfterWrite)) {
    const harness = harnessOf(status);
    return (
      <Alert
        status="success"
        title="Ready"
        description={`The agent is ready${
          harness ? ` on Harness ${harness}` : ' on its Harness'
        }${requestedBy ? ` (${wording.done.toLowerCase()}${as})` : ''}.`}
      />
    );
  }

  return (
    <Alert
      status="danger"
      title={wording.failedTitle}
      description={
        status?.summary ??
        'agent-manager reports the agent failed on its Harness.'
      }
    />
  );
}

/**
 * The agent's readiness right after Deploy, from agent-manager's
 * `get_agent_status` polled until the agent's Harness has a verdict.
 *
 * Rendered only on the visit that follows a create (the review page hands the
 * agent over in the router state) and only for the agent the page shows;
 * otherwise nothing, and nothing is read. While the agent compiles it says
 * so with agent-manager's summary; once the verdict is `ready` it names the
 * Harness the agent runs on, and a `failed` verdict carries agent-manager's
 * reason — the same verdict the page's own status card derives from
 * `status.conditions`, so the two never disagree. A `failed` verdict on a new
 * agent the page reads as still being set up reads as still deploying, and
 * one the page's Agent read has since found ready reads as Ready, so the alert
 * follows the agent without a reload.
 */
export function AgentCreationProgress({
  installation,
  namespace,
  name,
  agentReady,
  isSettingUp,
}: {
  installation: string;
  namespace: string;
  name: string;
} & AgentReadState) {
  const handoff = useAgentCreatedHandoff();
  if (
    !handoff ||
    handoff.installation !== installation ||
    handoff.namespace !== namespace ||
    handoff.name !== name
  ) {
    return null;
  }
  return (
    <CreatedAgentVerdict
      handoff={handoff}
      agentReady={agentReady}
      isSettingUp={isSettingUp}
    />
  );
}
