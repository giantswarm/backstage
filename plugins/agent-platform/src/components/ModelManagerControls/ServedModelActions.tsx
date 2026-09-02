import { useState } from 'react';
import { toastApiRef, useApi } from '@backstage/frontend-plugin-api';
import {
  ButtonIcon,
  Menu,
  MenuItem,
  MenuTrigger,
  Switch,
  Text,
} from '@backstage/ui';
import CloudDownloadIcon from '@material-ui/icons/CloudDownload';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import EjectIcon from '@material-ui/icons/Eject';
import LinkIcon from '@material-ui/icons/Link';
import LinkOffIcon from '@material-ui/icons/LinkOff';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import {
  SERVED_MODEL_ACTION_LABEL,
  useServedModelAction,
  type ServedModelAction,
} from '../../hooks/useServedModelAction';
import type { ServedModel, ServingCapabilities } from '../../lib/serving';

const TOAST_TIMEOUT_MS = 6000;

export type ServedModelActionsProps = {
  model: ServedModel;
  /** The installation's flags; decide which items exist at all. */
  capabilities: ServingCapabilities;
};

/**
 * The per-row kebab menu of the Serving section: load / unload, create or
 * remove the model's kagent ModelConfig, and delete — each present only when
 * the installation's backend reports the matching capability, and only in the
 * state where it makes sense (no "Load" on a loaded model). Rendered per
 * capability flag, never per backend name.
 *
 * Deletion asks first, with the one choice the backend offers: whether to take
 * the model's ModelConfig with it (the default, so no agent is left pointing at
 * a model that is gone). Everything else runs on click and reports through a
 * toast; failures land in a toast too, since there is no dialog to hold them.
 */
export function ServedModelActions({
  model,
  capabilities,
}: ServedModelActionsProps) {
  const toastApi = useApi(toastApiRef);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [unwireOnDelete, setUnwireOnDelete] = useState(true);
  const { run, isPending, pendingAction, error, reset } = useServedModelAction(
    model.installation,
  );

  const items: { action: ServedModelAction; icon: typeof LinkIcon }[] = [];
  if (capabilities.load && model.loaded === false) {
    items.push({
      action: { type: 'load', model: model.name },
      icon: CloudDownloadIcon,
    });
  }
  if (capabilities.unload && model.loaded === true) {
    items.push({
      action: { type: 'unload', model: model.name },
      icon: EjectIcon,
    });
  }
  if (capabilities.wire && !model.modelConfig) {
    items.push({ action: { type: 'wire', model: model.name }, icon: LinkIcon });
  }
  if (capabilities.wire && model.modelConfig) {
    items.push({
      action: { type: 'unwire', model: model.name },
      icon: LinkOffIcon,
    });
  }
  const canDelete = capabilities.delete;

  if (items.length === 0 && !canDelete) {
    return null;
  }

  const perform = async (action: ServedModelAction) => {
    try {
      await run(action);
    } catch (failure) {
      toastApi.post({
        title: `${SERVED_MODEL_ACTION_LABEL[action.type]} failed for ${model.name}`,
        description: (failure as Error).message,
        status: 'danger',
        timeout: TOAST_TIMEOUT_MS * 2,
      });
      return false;
    }
    return true;
  };

  const onMenuAction = async (action: ServedModelAction) => {
    if (await perform(action)) {
      toastApi.post({
        title: `${model.name}: ${describeOutcome(action)}`,
        status: 'success',
        timeout: TOAST_TIMEOUT_MS,
      });
    }
  };

  const openDelete = () => {
    reset();
    setUnwireOnDelete(true);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    // Without the wire capability there is nothing the backend could unwire;
    // with it, the switch decides when a ModelConfig is known, and the
    // server's default (remove whatever it wired) applies when none is.
    let unwire = false;
    if (capabilities.wire) {
      unwire = model.modelConfig ? unwireOnDelete : true;
    }
    try {
      await run({ type: 'delete', model: model.name, unwire });
    } catch {
      // Left to the dialog, which stays open and renders `error`.
      return;
    }
    setDeleteOpen(false);
    toastApi.post({
      title: `${model.name} deleted`,
      status: 'success',
      timeout: TOAST_TIMEOUT_MS,
    });
  };

  const busyLabel = pendingAction
    ? `${SERVED_MODEL_ACTION_LABEL[pendingAction.type]}…`
    : undefined;

  return (
    <>
      <MenuTrigger>
        <ButtonIcon
          icon={<MoreVertIcon />}
          aria-label={
            busyLabel
              ? `${busyLabel} ${model.name}`
              : `Actions for ${model.name}`
          }
          variant="tertiary"
          isDisabled={isPending}
        />
        <Menu>
          {items.map(({ action, icon: Icon }) => (
            <MenuItem
              key={action.type}
              iconStart={<Icon />}
              onAction={() => onMenuAction(action)}
            >
              {SERVED_MODEL_ACTION_LABEL[action.type]}
            </MenuItem>
          ))}
          {canDelete && (
            <MenuItem
              color="danger"
              iconStart={<DeleteOutlineIcon />}
              onAction={openDelete}
            >
              Delete…
            </MenuItem>
          )}
        </Menu>
      </MenuTrigger>

      {canDelete && (
        <ConfirmDialog
          isOpen={isDeleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete ${model.name}?`}
          destructive
          confirmLabel="Delete model"
          busyLabel="Deleting…"
          isBusy={isPending && pendingAction?.type === 'delete'}
          error={error?.message}
          onConfirm={confirmDelete}
        >
          <Text variant="body-medium">
            The downloaded weights are removed from the serving backend on{' '}
            {model.installation}. Pulling the model again re-downloads them.
          </Text>
          {capabilities.wire && model.modelConfig && (
            <Switch
              label={`Also remove its model config ${model.modelConfig.namespace}/${model.modelConfig.name}, so no agent keeps pointing at a model that is gone`}
              isSelected={unwireOnDelete}
              onChange={setUnwireOnDelete}
              isDisabled={isPending}
            />
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

function describeOutcome(action: ServedModelAction): string {
  switch (action.type) {
    case 'load':
      return 'loaded into memory';
    case 'unload':
      return 'unloaded';
    case 'wire':
      return 'model config created';
    case 'unwire':
      return 'model config removed';
    default:
      return 'done';
  }
}
