import { Alert } from '@backstage/ui';

import {
  useAgentCreatedHandoff,
  type AgentCreatedHandoff,
} from '../../hooks/useAgentCreatedHandoff';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import type { AgentStatus } from '../../lib/agentManager';

/** The admitting Harness's entry, when the template has one. */
function harnessOf(status: AgentStatus | undefined): string | undefined {
  return status?.template?.harnesses?.[0]?.harness;
}

/**
 * The polling half, mounted only for the agent that was just created: the
 * verdict from agent-manager's `get_agent_status`, re-read until the platform
 * Harness reports `ready` or `failed`.
 */
function CreatedAgentVerdict({ handoff }: { handoff: AgentCreatedHandoff }) {
  const { installation, namespace, name, requestedBy } = handoff;
  const { status, isSettling, error } = useAgentStatus(
    installation,
    namespace,
    name,
  );

  const as = requestedBy ? ` as ${requestedBy}` : '';

  if (error) {
    return (
      <Alert
        status="warning"
        title="Created, but the readiness could not be read"
        description={`agent-manager applied the release${as}. ${error.message}`}
      />
    );
  }

  if (isSettling) {
    return (
      <Alert
        status="info"
        title="Deploying…"
        description={
          status?.summary ??
          `agent-manager applied the release${as}; waiting for the platform Harness to compile the template.`
        }
      />
    );
  }

  if (status?.verdict === 'ready') {
    const harness = harnessOf(status);
    return (
      <Alert
        status="success"
        title="Ready"
        description={`The agent is ready${
          harness ? ` on Harness ${harness}` : ' on the platform Harness'
        }${requestedBy ? ` (created${as})` : ''}.`}
      />
    );
  }

  return (
    <Alert
      status="danger"
      title="The agent did not become ready"
      description={
        status?.summary ??
        'agent-manager reports the template failed on the platform Harness.'
      }
    />
  );
}

/**
 * The agent's readiness right after Deploy, from agent-manager's
 * `get_agent_status` polled until the platform Harness has a verdict.
 *
 * Rendered only on the visit that follows a create (the review page hands the
 * agent over in the router state) and only for the agent the page shows;
 * otherwise nothing, and nothing is read. While the template compiles it says
 * so with agent-manager's summary; once the verdict is `ready` it names the
 * Harness the agent runs on, and a `failed` verdict carries agent-manager's
 * reason — the same verdict the page's own status card derives from
 * `status.harnesses[]`, so the two never disagree.
 */
export function AgentCreationProgress({
  installation,
  namespace,
  name,
}: {
  installation: string;
  namespace: string;
  name: string;
}) {
  const handoff = useAgentCreatedHandoff();
  if (
    !handoff ||
    handoff.installation !== installation ||
    handoff.namespace !== namespace ||
    handoff.name !== name
  ) {
    return null;
  }
  return <CreatedAgentVerdict handoff={handoff} />;
}
