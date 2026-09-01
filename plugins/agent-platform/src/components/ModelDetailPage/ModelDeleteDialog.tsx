import { Text } from '@backstage/ui';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

export type ModelDeleteDialogProps = {
  modelConfig: ModelConfig;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isDeleting: boolean;
  error?: string;
  onConfirm: () => void;
};

/**
 * Asks before deleting a model.
 *
 * Says one thing, because it is the only thing the person clicking cannot
 * work out for themselves: from here on, nobody can create an agent on this
 * model any more. Agents that still *use* it are not at risk — the mutation
 * refuses to delete a referenced model outright, and that refusal (with the
 * agent names) renders in this dialog's error slot.
 */
export function ModelDeleteDialog({
  modelConfig,
  isOpen,
  onOpenChange,
  isDeleting,
  error,
  onConfirm,
}: ModelDeleteDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete model "${modelConfig.getDisplayName()}"?`}
      destructive
      confirmLabel="Delete model"
      busyLabel="Deleting…"
      isBusy={isDeleting}
      error={error}
      onConfirm={onConfirm}
    >
      <Text variant="body-medium">
        The model disappears from the picker, so no new agents can be created on
        it. Its stored API key is removed along with it.
      </Text>
    </ConfirmDialog>
  );
}
