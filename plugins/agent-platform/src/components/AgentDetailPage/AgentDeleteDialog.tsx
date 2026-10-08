import { Flex, Text } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import type { AgentDeletionState } from '../../hooks/useAgentDeletion';
import type { CommitAgentResult } from '../../lib/agentManager';
import { CommitOutcome } from '../CommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';

export type AgentDeleteDialogProps = {
  installation: string;
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
  /** What `mode: commit` answered: the pull request, or the connect step. */
  commitResult?: CommitAgentResult;
};

/**
 * Whether agent-manager's commit answer settles the deletion — the pull
 * request is open, or the request was accepted. The connect step does not:
 * the person connects and tries again.
 */
export function isCommitSettled(result: CommitAgentResult): boolean {
  return result.status !== 'auth_required';
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
 * viewer's confirm shows the apiserver's Forbidden. The portal decides nothing
 * in advance and never passes `force`.
 */
export function AgentDeleteDialog({
  installation,
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
  const notConnected = failure?.kind === 'not-connected';
  const viaPullRequest = mode === 'commit';

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
      error={failure && !notConnected ? failure.message : undefined}
      isDone={
        viaPullRequest &&
        commitResult !== undefined &&
        isCommitSettled(commitResult)
      }
      onConfirm={viaPullRequest ? onCommit : onConfirm}
    >
      <Flex direction="column" gap="3">
        {viaPullRequest && (
          <Text variant="body-medium">
            This agent is applied from its GitOps repository, so agent-manager
            opens a pull request as you that removes its files. The agent is
            deleted once the pull request is merged.
          </Text>
        )}
        <Text variant="body-medium">
          {viaPullRequest ? 'That ends' : 'This ends'} any session currently
          running with this agent — including sessions started by other people,
          which are not shown to you.
        </Text>
        {notConnected && (
          <ConnectAgentManagerAlert
            installation={installation}
            message={failure.message}
            action="Agents are deleted"
          />
        )}
        {viaPullRequest && commitResult && (
          <CommitOutcome result={commitResult} />
        )}
      </Flex>
    </ConfirmDialog>
  );
}
