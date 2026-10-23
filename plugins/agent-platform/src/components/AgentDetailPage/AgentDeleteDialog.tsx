import { Flex, Text } from '@backstage/ui';
import {
  ConfirmDialog,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentCommitCheck } from '../../hooks/useAgentCommitCheck';
import type { AgentDeletionState } from '../../hooks/useAgentDeletion';
import {
  missingReleaseFile,
  type CommitAgentResult,
} from '../../lib/agentManager';
import { CommitOutcome } from '../CommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { ReleaseOutsideDirectory } from '../ReleaseOutsideDirectory';

export type AgentDeleteDialogProps = {
  installation: string;
  namespace: string;
  name: string;
  displayName: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  deletion: AgentDeletionState;
  /**
   * `apply` deletes the release live. `commit` is for an agent applied from
   * git, which agent-manager refuses to delete live: the only action is then a
   * pull request that removes the agent's files from the owning GitOps
   * repository (`mode: commit`, giantswarm/agent-manager#24).
   */
  mode: 'apply' | 'commit';
  onConfirm: () => void;
  onCommit: () => void;
  /** What `mode: commit` answered: the pull request. */
  commitResult?: CommitAgentResult;
};

/**
 * Whether agent-manager's commit answer settles the deletion: it names the
 * pull request, or that the repository already says so. The connect step
 * (`auth_required`) is a refusal, so it never reaches here.
 */
export function isCommitSettled(result: CommitAgentResult): boolean {
  return result.commit !== undefined;
}

/**
 * Asks before deleting an agent.
 *
 * Says one thing, because it is the only thing the person clicking cannot work
 * out for themselves: sessions may be running, and not all of them are on screen.
 * kagent scopes its conversations to the caller, so a quiet sessions list is not
 * evidence that an agent is idle — someone else's conversation ends just the same.
 * For an agent applied from git it also says that the delete is a pull request,
 * and the agent goes once that is merged.
 *
 * Everything mechanical is agent-manager's now — which `HelmRelease` goes, what
 * happens to the namespace's shared chart source, why a GitOps-owned or
 * suspended release is refused, which repository the pull request goes to —
 * and comes back in its words: a refusal is shown as the error, verbatim; a
 * viewer's confirm shows the apiserver's Forbidden. The portal never passes
 * `force`.
 *
 * One thing is asked in advance, for a pull request: whether agent-manager
 * can open one for this agent at all (`useAgentCommitCheck`, run while the
 * dialog is open). Confirm is enabled once it passes. An agent defined outside
 * agent-manager's directory gets the explanation and only Close; a missing
 * GitHub authorization gets the sign-in. Any other failure of the check leaves
 * confirm enabled, and the delete answers for itself. The same two refusals
 * of the delete itself read the same way, should the repository change in
 * between.
 */
export function AgentDeleteDialog({
  installation,
  namespace,
  name,
  displayName,
  isOpen,
  onOpenChange,
  deletion,
  mode,
  onConfirm,
  onCommit,
  commitResult,
}: AgentDeleteDialogProps) {
  const { failure, isDeleting, isCommitting } = deletion;
  const viaPullRequest = mode === 'commit';
  const check = useAgentCommitCheck(
    installation,
    namespace,
    name,
    isOpen && viaPullRequest,
  );
  const isChecking = check.status === 'checking';

  // What stands in the pull request's way: the check's answer, or the
  // delete's own refusal of the same kind.
  let releaseOutside;
  if (check.status === 'release-outside') {
    releaseOutside = { missing: check.missing, message: check.message };
  } else {
    const missing = missingReleaseFile(failure);
    releaseOutside =
      missing && failure ? { missing, message: failure.message } : undefined;
  }
  let connect;
  if (failure?.kind === 'not-connected' || failure?.code === 'auth_required') {
    connect = {
      github: failure.code === 'auth_required',
      message: failure.message,
    };
  } else if (check.status === 'connect') {
    connect = { github: check.github, message: check.message };
  }
  const shownError =
    failure && !connect && !releaseOutside ? failure.message : undefined;

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete agent "${displayName}"?`}
      // A pull request can be closed unmerged; a live delete cannot be undone.
      destructive={!viaPullRequest}
      confirmLabel={viaPullRequest ? 'Open pull request' : 'Delete agent'}
      busyLabel={viaPullRequest ? 'Opening pull request…' : 'Deleting…'}
      isBusy={isDeleting || isCommitting}
      // agent-manager's refusal, in its own words: a GitOps-owned release its
      // verdict was not read for, a suspended one, the apiserver's Forbidden
      // for a viewer.
      error={shownError}
      isConfirmDisabled={
        viaPullRequest && (isChecking || Boolean(connect && !failure))
      }
      isDone={
        viaPullRequest &&
        (Boolean(releaseOutside) ||
          (commitResult !== undefined && isCommitSettled(commitResult)))
      }
      onConfirm={viaPullRequest ? onCommit : onConfirm}
    >
      <Flex direction="column" gap="3">
        {releaseOutside ? (
          <ReleaseOutsideDirectory
            missing={releaseOutside.missing}
            message={releaseOutside.message}
            action="delete"
            variant="alert"
          />
        ) : (
          <>
            {viaPullRequest && (
              <Text variant="body-medium">
                This agent is applied from GitOps, so agent-manager opens a pull
                request as you that removes its files. The agent is deleted once
                it is merged.
              </Text>
            )}
            <Text variant="body-medium">
              {viaPullRequest ? 'That ends' : 'This ends'} every running session
              with this agent, including other people's.
            </Text>
          </>
        )}
        {connect && (
          <ConnectAgentManagerAlert
            installation={installation}
            message={connect.message}
            action="Agents are deleted"
            needsGitHub={connect.github}
          />
        )}
        {isChecking && (
          <LoadingIndicator label="Asking agent-manager whether it can open the pull request…" />
        )}
        {viaPullRequest && commitResult && (
          <CommitOutcome result={commitResult} />
        )}
      </Flex>
    </ConfirmDialog>
  );
}
