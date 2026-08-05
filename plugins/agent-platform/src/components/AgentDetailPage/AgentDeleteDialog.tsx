import { Text } from '@backstage/ui';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

export type AgentDeleteDialogProps = {
  agent: Agent;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isDeleting: boolean;
  error?: string;
  onConfirm: () => void;
};

/**
 * Asks before deleting an agent.
 *
 * Says one thing, because it is the only thing the person clicking cannot work
 * out for themselves: sessions may be running, and not all of them are on screen.
 * kagent scopes its session list to the caller, so a quiet sessions list is not
 * evidence that an agent is idle — someone else's conversation ends just the same.
 *
 * Everything mechanical is deliberately left out: which `HelmRelease` goes, what
 * happens to the namespace's shared chart source, what a suspended release does to
 * the uninstall. Correct, and all of it noise at the moment of deciding. It lives
 * in `useDeleteAgent` and in docs/agent-platform.md instead.
 */
export function AgentDeleteDialog({
  agent,
  isOpen,
  onOpenChange,
  isDeleting,
  error,
  onConfirm,
}: AgentDeleteDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete agent "${agent.getDisplayName()}"?`}
      destructive
      confirmLabel="Delete agent"
      busyLabel="Deleting…"
      isBusy={isDeleting}
      error={error}
      onConfirm={onConfirm}
    >
      <Text variant="body-medium">
        This ends any session currently running with this agent — including
        sessions started by other people, which are not shown to you.
      </Text>
    </ConfirmDialog>
  );
}
