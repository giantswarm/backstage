import { Text } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';
import type { StopServedModelVia } from '../../hooks/useStopServedModel';
import type { ServedModelRow } from './ServedModelsTable';

export type StopServedModelDialogProps = {
  model: ServedModelRow;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isStopping: boolean;
  error?: string;
  /**
   * How the model is stopped — through model-manager (which also removes the
   * model config it created for it) or by deleting the CR with the user's
   * RBAC (the model configs stay). Defaults to the CR.
   */
  via?: StopServedModelVia;
  onConfirm: () => void;
};

/**
 * Asks before stopping a served model — deleting its InferenceService.
 *
 * Says the things the person clicking cannot see for themselves: the weight
 * cache on the node survives (so serving it again is quick), and what becomes
 * of the model configs pointing at it — they stay when the CR is deleted, so
 * agents keep their configuration but fail until the model is served again;
 * model-manager removes the one it created itself and leaves the others.
 */
export function StopServedModelDialog({
  model,
  isOpen,
  onOpenChange,
  isStopping,
  error,
  via = 'inferenceservice',
  onConfirm,
}: StopServedModelDialogProps) {
  const where = model.namespace
    ? `${model.namespace} on ${model.installation}`
    : model.installation;
  const managedModelConfig =
    model.modelConfig && model.modelConfig.managed !== false
      ? model.modelConfig
      : undefined;
  const consumersKept = model.usedBy.filter(
    consumer =>
      !(
        managedModelConfig &&
        consumer.namespace === managedModelConfig.namespace &&
        consumer.name === managedModelConfig.name
      ),
  );
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
        {via === 'model-manager'
          ? `model-manager deletes the InferenceService ${model.name} in ${where}`
          : `The InferenceService ${model.name} in ${where} is deleted`}{' '}
        and KServe removes its predictor, freeing the GPU. The downloaded
        weights stay in the model cache on the node, so serving it again skips
        the download.
      </Text>
      {via === 'model-manager' && managedModelConfig && (
        <Text variant="body-medium">
          The model config {managedModelConfig.namespace}/
          {managedModelConfig.name} model-manager created for it is removed as
          well, so no agent keeps pointing at a model that is gone.
        </Text>
      )}
      {via === 'model-manager' && (
        <Text variant="body-small" color="secondary">
          Should model-manager not recognise the model it serves, the
          InferenceService is deleted with your own permissions instead.
        </Text>
      )}
      {consumersKept.length > 0 && (
        <Text variant="body-medium">
          The model config{consumersKept.length === 1 ? '' : 's'}{' '}
          {consumersKept.map(consumer => consumer.displayName).join(', ')}{' '}
          {consumersKept.length === 1 ? 'stays' : 'stay'} in place so agents
          keep their configuration; their requests fail until the model is
          served again under the same name.
        </Text>
      )}
    </ConfirmDialog>
  );
}
