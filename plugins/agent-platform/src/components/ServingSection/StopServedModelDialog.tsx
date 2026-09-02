import { Text } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';
import type { ServedModelRow } from './ServedModelsTable';

export type StopServedModelDialogProps = {
  model: ServedModelRow;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isStopping: boolean;
  error?: string;
  onConfirm: () => void;
};

/**
 * Asks before stopping a served model — deleting its InferenceService.
 *
 * Says the two things the person clicking cannot see for themselves: the
 * weight cache on the node survives (so serving it again is quick), and the
 * model configs pointing at it stay, so agents keep their configuration but
 * fail until the model is served again.
 */
export function StopServedModelDialog({
  model,
  isOpen,
  onOpenChange,
  isStopping,
  error,
  onConfirm,
}: StopServedModelDialogProps) {
  const where = model.namespace
    ? `${model.namespace} on ${model.installation}`
    : model.installation;
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Stop serving "${model.displayName ?? model.name}"?`}
      destructive
      confirmLabel="Stop serving"
      busyLabel="Stopping…"
      isBusy={isStopping}
      error={error}
      onConfirm={onConfirm}
    >
      <Text variant="body-medium">
        The InferenceService {model.name} in {where} is deleted and KServe
        removes its predictor, freeing the GPU. The downloaded weights stay in
        the model cache on the node, so serving it again skips the download.
      </Text>
      {model.usedBy.length > 0 && (
        <Text variant="body-medium">
          The model config{model.usedBy.length === 1 ? '' : 's'}{' '}
          {model.usedBy.map(consumer => consumer.displayName).join(', ')}{' '}
          {model.usedBy.length === 1 ? 'stays' : 'stay'} in place so agents keep
          their configuration; their requests fail until the model is served
          again under the same name.
        </Text>
      )}
    </ConfirmDialog>
  );
}
