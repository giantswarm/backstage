import { Button, Flex, Text } from '@backstage/ui';
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
   * agent-manager reports the `commit` capability (giantswarm/agent-manager#24):
   * the dialog also offers a pull request that removes the agent's files from
   * the owning GitOps repository. Hidden otherwise.
   */
  canCommit: boolean;
  onConfirm: () => void;
  onCommit: () => void;
  /** What `mode: commit` answered: the pull request, or the connect step. */
  commitResult?: CommitAgentResult;
};

/**
 * Asks before deleting an agent.
 *
 * Says one thing, because it is the only thing the person clicking cannot work
 * out for themselves: sessions may be running, and not all of them are on screen.
 * kagent scopes its conversations to the caller, so a quiet sessions list is not
 * evidence that an agent is idle — someone else's conversation ends just the same.
 *
 * Everything mechanical is agent-manager's now — which `HelmRelease` goes, what
 * happens to the namespace's shared chart source, why a GitOps-owned or
 * suspended release is refused — and comes back in its words: a refusal is
 * shown as the error, verbatim; a viewer's confirm shows the apiserver's
 * Forbidden. The portal decides nothing in advance and never passes `force`.
 */
export function AgentDeleteDialog({
  installation,
  displayName,
  isOpen,
  onOpenChange,
  deletion,
  canCommit,
  onConfirm,
  onCommit,
  commitResult,
}: AgentDeleteDialogProps) {
  const { failure, isDeleting, isCommitting } = deletion;
  const notConnected = failure?.kind === 'not-connected';

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete agent "${displayName}"?`}
      destructive
      confirmLabel="Delete agent"
      busyLabel="Deleting…"
      isBusy={isDeleting || isCommitting}
      // agent-manager's refusal, in its own words: a GitOps-owned or suspended
      // release, the apiserver's Forbidden for a viewer.
      error={failure && !notConnected ? failure.message : undefined}
      onConfirm={onConfirm}
    >
      <Flex direction="column" gap="3">
        <Text variant="body-medium">
          This ends any session currently running with this agent — including
          sessions started by other people, which are not shown to you.
        </Text>
        {notConnected && (
          <ConnectAgentManagerAlert
            installation={installation}
            message={failure.message}
            action="Agents are deleted"
          />
        )}
        {canCommit && (
          <Flex direction="column" gap="2">
            <Text variant="body-small" color="secondary">
              Or remove it from its GitOps repository instead: agent-manager
              opens a pull request as you that deletes the agent's files.
            </Text>
            <div>
              <Button
                variant="secondary"
                size="small"
                isDisabled={isDeleting || isCommitting}
                onPress={onCommit}
              >
                {isCommitting ? 'Committing…' : 'Commit'}
              </Button>
            </div>
            {commitResult && <CommitOutcome result={commitResult} />}
          </Flex>
        )}
      </Flex>
    </ConfirmDialog>
  );
}
