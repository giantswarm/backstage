import { Alert, Button, Link, Text } from '@backstage/ui';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';

import { useAgentCreatedHandoff } from '../../hooks/useAgentCreatedHandoff';
import { useCustomizePaths } from '../../hooks/useCustomizePaths';

/**
 * The fix for the platform's default agent waiting for a default model
 * (`awaitsDefaultModel`), linked to the Models page where it resolves.
 */
export function NoModelYetText() {
  const { models } = useCustomizePaths();
  return (
    <Text variant="body-small">
      No model yet. Add one under{' '}
      {models ? <Link href={models}>Models</Link> : 'Models'}.
    </Text>
  );
}

/** A failed agent whose git skills' credential Secret does not exist. */
function skillsCredentialMissingText(
  secret: string,
  namespace: string,
): string {
  return `The credential Secret ${secret} that the agent fetches its private skills with is missing in the namespace ${namespace}. Once the Secret exists, the agent recovers on its own; there is nothing to edit.`;
}

/**
 * An agent whose Harness has not finished booting the current revision. A
 * boot that keeps failing stays in this state, so the text says where the
 * reason is.
 */
const BOOT_PENDING_TEXT =
  "The agent has not booted yet: its Harness is starting it for the first snapshot, which usually takes under a minute. If it stays here, the boot log of the agent's worker says why, such as a skill whose fetch GitHub refused for a wrong or expired token.";

/**
 * Why sessions cannot be started with this agent, in place of the header's
 * **Use this agent**, which is offered only for a ready agent — on every tab,
 * because the reason is true on every tab.
 *
 * A failed agent names the root cause and, when the viewer may edit the agent
 * and the cause is in its spec, offers **Edit agent**; a platform cause (the
 * Harness's WorkerPool) is not the author's to fix, so it offers nothing, and
 * neither does a missing skills credential Secret, which is fixed by creating
 * the Secret. An agent still converging says so, a boot that has not finished
 * pointing at the boot log, including after a write: `AgentCreationProgress`
 * narrates convergence but does not explain a boot that keeps failing.
 */
export function AgentSessionBlocker({
  agent,
  onEdit,
  isGitOpsOwned = false,
  isPlatformOwned = false,
  awaitsModel = false,
}: {
  agent: Agent;
  /**
   * Opens the edit page. Absent when the viewer cannot write the agent; for an
   * agent applied from git, present only when the edit page can commit.
   */
  onEdit?: () => void;
  /** The agent's HelmRelease is applied from git, so it is fixed there. */
  isGitOpsOwned?: boolean;
  /** The platform's own agent: read-only, so a platform admin fixes it. */
  isPlatformOwned?: boolean;
  /** The default agent waits for a default model (`awaitsDefaultModel`). */
  awaitsModel?: boolean;
}) {
  const handoff = useAgentCreatedHandoff();
  const readiness = agent.getReadiness();

  if (readiness === 'ready') {
    return null;
  }

  if (awaitsModel) {
    return (
      <Alert
        status={readiness === 'failed' ? 'danger' : 'info'}
        icon
        title="Sessions cannot start"
        description={<NoModelYetText />}
      />
    );
  }

  if (readiness === 'failed') {
    const failure = agent.getFailure();
    const isPlatform = failure?.field === 'platform';
    const isMissingCredential = Boolean(failure?.missingSecret);
    const reason = failure?.message ?? agent.getReadinessMessage();
    // Verbatim on its own; a sentence follows it only without its full stop.
    const sentence = reason?.replace(/\.$/, '');
    let description = reason;
    if (isMissingCredential) {
      description = skillsCredentialMissingText(
        failure!.missingSecret!,
        agent.getNamespace() ?? '',
      );
    } else if (isPlatform) {
      description = `${sentence}. This is a platform problem, not the agent's, and a platform admin has to fix it.`;
    } else if (isPlatformOwned) {
      description = `${sentence}. It is owned by the platform, so a platform admin has to fix it.`;
    } else if (isGitOpsOwned) {
      description = onEdit
        ? `${sentence}. It is deployed from GitOps, so a fix opens a pull request there.`
        : `${sentence}. It is deployed from GitOps, so fix it there.`;
    }
    const canFix = onEdit && !isPlatform && !isMissingCredential;

    return (
      <Alert
        status="danger"
        icon
        title="Sessions cannot start"
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
  if (isFollowingWrite && !agent.isBootPending()) {
    return null;
  }

  return (
    <Alert
      status="info"
      icon
      title="Sessions can start once the agent is ready"
      description={
        (agent.isBootPending() ? BOOT_PENDING_TEXT : undefined) ??
        agent.getReadinessMessage() ??
        (readiness === 'pending'
          ? 'The controller has not reported on the current version of this agent yet.'
          : 'The Harness is preparing the current revision.')
      }
    />
  );
}
