import { Alert, Button } from '@backstage/ui';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';

import { useAgentCreatedHandoff } from '../../hooks/useAgentCreatedHandoff';

/**
 * Why sessions cannot be started with this agent, in place of the header's
 * **Start a session**, which is offered only for a ready agent — on every tab,
 * because the reason is true on every tab.
 *
 * A failed agent names the root cause and, when the viewer may edit the agent
 * and the cause is in its spec, offers **Edit agent**; a platform cause (the
 * Harness's WorkerPool) is not the author's to fix, so it offers nothing. An
 * agent still converging says so — unless the page is already following a
 * write to it, which `AgentCreationProgress` narrates.
 */
export function AgentSessionBlocker({
  agent,
  onEdit,
}: {
  agent: Agent;
  /** Opens the edit page. Absent when the viewer cannot write the agent. */
  onEdit?: () => void;
}) {
  const handoff = useAgentCreatedHandoff();
  const readiness = agent.getReadiness();

  if (readiness === 'ready') {
    return null;
  }

  if (readiness === 'failed' || readiness === 'notAdmitted') {
    const failure = agent.getFailure();
    const isPlatform = failure?.field === 'platform';
    const reason = failure?.message ?? agent.getReadinessMessage();
    const description = isPlatform
      ? `${reason}. This is a problem with the platform, not with the agent: a platform admin has to fix it.`
      : reason;
    // The admission label is not on the edit page, so a not-admitted agent
    // has nothing there to fix.
    const canFix = onEdit && readiness === 'failed' && !isPlatform;

    return (
      <Alert
        status="danger"
        icon
        title="Sessions can't start"
        description={description}
        customActions={
          canFix ? (
            <Button size="small" variant="secondary" onPress={onEdit}>
              Edit agent
            </Button>
          ) : undefined
        }
      />
    );
  }

  const isFollowingWrite =
    handoff?.installation === agent.cluster &&
    handoff?.namespace === agent.getNamespace() &&
    handoff?.name === agent.getName();
  if (isFollowingWrite) {
    return null;
  }

  return (
    <Alert
      status="info"
      icon
      title="Sessions can start once the agent is ready"
      description={
        agent.getReadinessMessage() ??
        (readiness === 'pending'
          ? 'The controller has not reported on the current version of this agent yet.'
          : 'The Harness is preparing the current revision.')
      }
    />
  );
}
