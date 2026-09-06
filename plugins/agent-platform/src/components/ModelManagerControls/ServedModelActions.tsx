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
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import StopIcon from '@material-ui/icons/Stop';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import {
  SERVED_MODEL_ACTION_LABEL,
  useServedModelAction,
  type ServedModelAction,
} from '../../hooks/useServedModelAction';
import {
  isServedInferenceService,
  managerRefOf,
} from '../../lib/modelManagerServing';
import type {
  ServedModel,
  ServingCapabilities,
  ServingLoading,
} from '../../lib/serving';

const TOAST_TIMEOUT_MS = 6000;

/** The keep-alive that pins a model against slot eviction on a backend without an idle timer (Lemonade). */
export const PIN_KEEP_ALIVE = '-1';

/**
 * Whether a backend pins rather than times out: it loads on demand but never
 * evicts idle models and has no keep-alive of its own — a load holds the
 * model until it is unloaded or displaced by another of its kind, and a load
 * with `keepAlive: -1` exempts it from that displacement (Lemonade's
 * `pinned`). Decided from the backend's `loading` block, never its name.
 */
export function offersPin(loading: ServingLoading | undefined): boolean {
  return Boolean(
    loading &&
    loading.onDemand &&
    !loading.idleEviction &&
    loading.keepAliveDefault === undefined &&
    loading.keepAliveScope === undefined,
  );
}

export type ServedModelActionsProps = {
  model: ServedModel;
  /** The flags of the row's backend on its installation; decide which items exist at all. */
  capabilities: ServingCapabilities;
  /** How the row's backend loads models, where it says: decides whether a load may pin. */
  loading?: ServingLoading;
  /**
   * Offer "Serve…" on a KServe model that is not serving — a cached download,
   * a preset — opening the portal's serve flow pre-filled with it (the fit
   * check, the composed InferenceService, the user's own RBAC). Without it a
   * KServe backend with `load` gets the plain model-manager load instead.
   */
  onServe?: (model: ServedModel) => void;
  /**
   * Offer "Stop serving…" on a served KServe model (an InferenceService),
   * whichever source listed it: the section confirms and then stops it
   * through model-manager where it operates the row, else by deleting the
   * CR with the user's RBAC. With it, no "Unload" appears on KServe rows.
   */
  onStop?: (model: ServedModel) => void;
};

/** The per-row menu items, labelled per backend where the words differ. */
type MenuEntry = {
  key: string;
  label: string;
  icon: typeof LinkIcon;
  color?: 'danger';
  run: () => void | Promise<void>;
};

/**
 * Whether this row offers anything at all — the section's rule for the
 * actions column, so an installation with nothing to do on a row shows no
 * empty menu. Mirrors the items {@link ServedModelActions} builds.
 */
export function hasRowActions(
  model: ServedModel,
  capabilities: ServingCapabilities,
  offers: { onServe?: unknown; onStop?: unknown } = {},
): boolean {
  const kserve = model.backend === 'kserve';
  const serving = kserve ? isServedInferenceService(model) : false;
  if (kserve && !serving && offers.onServe) {
    return true;
  }
  if (kserve && serving && offers.onStop) {
    return true;
  }
  if (!model.operable) {
    return false;
  }
  if (capabilities.load && model.loaded === false) {
    return true;
  }
  if (capabilities.unload && model.loaded === true) {
    return true;
  }
  if (capabilities.wire && (!kserve || serving)) {
    return true;
  }
  return (
    capabilities.delete && model.downloaded !== false && !(kserve && serving)
  );
}

/**
 * The per-row kebab menu of the Serving view — one menu per row, whatever
 * mix of sources listed it.
 *
 * Its items follow the installation's capability flags (never a backend's
 * name) and the row's state: load / unload, create or remove the model's
 * kagent ModelConfig, delete — each only where the backend reports the
 * capability and the state allows it (no "Load" on a loaded model, no
 * "Remove model config" on a ModelConfig model-manager did not create). On
 * KServe the words are the serving layer's: a model that is not serving
 * offers "Serve…" (the portal's serve flow when the section provides it, the
 * backend's own load otherwise), one that is offers "Stop serving…"; deleting
 * removes a cached download and is not offered while the model serves.
 *
 * Deletion asks first, with the one choice the backend offers: whether to
 * take the model's ModelConfig with it (the default, so no agent is left
 * pointing at a model that is gone). Everything else runs on click and reports
 * through a toast; failures land in a toast too, since there is no dialog to
 * hold them.
 */
export function ServedModelActions({
  model,
  capabilities,
  loading,
  onServe,
  onStop,
}: ServedModelActionsProps) {
  const toastApi = useApi(toastApiRef);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [unwireOnDelete, setUnwireOnDelete] = useState(true);
  const { run, isPending, pendingAction, error, reset } = useServedModelAction(
    model.installation,
  );

  const kserve = model.backend === 'kserve';
  const serving = kserve ? isServedInferenceService(model) : false;
  const ref = managerRefOf(model);
  // Every operation names the row's backend: one model-manager may run
  // several, and a same-named reference on another backend is not this row.
  const backend = model.backend;
  const operable = Boolean(model.operable);
  // A ModelConfig model-manager merely recognises (the portal's own wiring)
  // is not its to remove.
  const managedModelConfig =
    model.modelConfig !== undefined && model.modelConfig.managed !== false;

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
        title: `${model.name}: ${describeOutcome(action, kserve)}`,
        status: 'success',
        timeout: TOAST_TIMEOUT_MS,
      });
    }
  };

  const entries: MenuEntry[] = [];
  if (kserve && !serving && onServe) {
    entries.push({
      key: 'serve',
      label: 'Serve…',
      icon: PlayArrowIcon,
      run: () => onServe(model),
    });
  } else if (operable && capabilities.load && model.loaded === false) {
    entries.push({
      key: 'load',
      label: kserve ? 'Serve' : SERVED_MODEL_ACTION_LABEL.load,
      icon: kserve ? PlayArrowIcon : CloudDownloadIcon,
      run: () => onMenuAction({ type: 'load', model: ref, backend }),
    });
    // A backend that pins instead of timing out (Lemonade) offers the pin as
    // a second load: the model then survives another model of its kind
    // needing the slot.
    if (!kserve && offersPin(loading)) {
      entries.push({
        key: 'load-pin',
        label: 'Load and pin',
        icon: CloudDownloadIcon,
        run: () =>
          onMenuAction({
            type: 'load',
            model: ref,
            backend,
            keepAlive: PIN_KEEP_ALIVE,
          }),
      });
    }
  }
  if (kserve && serving && onStop) {
    entries.push({
      key: 'stop',
      label: 'Stop serving…',
      icon: StopIcon,
      color: 'danger',
      run: () => onStop(model),
    });
  } else if (operable && capabilities.unload && model.loaded === true) {
    entries.push({
      key: 'unload',
      label: kserve ? 'Stop serving' : SERVED_MODEL_ACTION_LABEL.unload,
      icon: kserve ? StopIcon : EjectIcon,
      run: () => onMenuAction({ type: 'unload', model: ref, backend }),
    });
  }
  // Wiring needs an endpoint: on KServe only a served model has one.
  if (operable && capabilities.wire && (!kserve || serving)) {
    if (!model.modelConfig) {
      entries.push({
        key: 'wire',
        label: SERVED_MODEL_ACTION_LABEL.wire,
        icon: LinkIcon,
        run: () => onMenuAction({ type: 'wire', model: ref, backend }),
      });
    } else if (managedModelConfig) {
      entries.push({
        key: 'unwire',
        label: SERVED_MODEL_ACTION_LABEL.unwire,
        icon: LinkOffIcon,
        run: () => onMenuAction({ type: 'unwire', model: ref, backend }),
      });
    }
  }
  // Nothing to delete for a model that was never downloaded; a served KServe
  // model's cache is refused by the backend until it stops serving.
  const canDelete =
    operable &&
    capabilities.delete &&
    model.downloaded !== false &&
    !(kserve && serving);

  if (entries.length === 0 && !canDelete) {
    return null;
  }

  const openDelete = () => {
    reset();
    setUnwireOnDelete(true);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    // Without the wire capability there is nothing the backend could unwire;
    // with it, the switch decides when a ModelConfig of its own is known, and
    // the server's default (remove whatever it wired) applies when none is.
    let unwire = false;
    if (capabilities.wire) {
      unwire = managedModelConfig ? unwireOnDelete : true;
    }
    try {
      await run({ type: 'delete', model: ref, backend, unwire });
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

  const where = model.node
    ? `the model cache on ${model.node}`
    : `the serving backend on ${model.installation}`;

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
          size="small"
          isDisabled={isPending}
        />
        <Menu>
          {entries.map(({ key, label, icon: Icon, color, run: onAction }) => (
            <MenuItem
              key={key}
              iconStart={<Icon />}
              {...(color ? { color } : {})}
              onAction={() => onAction()}
            >
              {label}
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
            The downloaded weights are removed from {where}
            {kserve && model.cachePath ? ` (${model.cachePath})` : ''}. Pulling
            the model again re-downloads them.
          </Text>
          {capabilities.wire && managedModelConfig && model.modelConfig && (
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

function describeOutcome(action: ServedModelAction, kserve: boolean): string {
  switch (action.type) {
    case 'load':
      if (kserve) {
        return 'InferenceService created; the status column follows it';
      }
      return action.keepAlive === PIN_KEEP_ALIVE
        ? 'loaded into memory and pinned'
        : 'loaded into memory';
    case 'unload':
      return kserve ? 'stopped serving' : 'unloaded';
    case 'wire':
      return 'model config created';
    case 'unwire':
      return 'model config removed';
    default:
      return 'done';
  }
}
