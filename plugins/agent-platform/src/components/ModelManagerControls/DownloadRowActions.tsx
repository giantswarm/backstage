import { toastApiRef, useApi } from '@backstage/frontend-plugin-api';
import { ButtonIcon, Menu, MenuItem, MenuTrigger } from '@backstage/ui';
import CancelIcon from '@material-ui/icons/Cancel';
import ClearIcon from '@material-ui/icons/Clear';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import ReplayIcon from '@material-ui/icons/Replay';

import { useCancelJob, usePullModel } from '../../hooks/usePullJobs';
import type { ServedModelDownloadRow } from '../ServingPage/ServedModelsTable';
import type { ServingCapabilities } from '../../lib/serving';

const TOAST_TIMEOUT_MS = 6000;

export type DownloadRowActionsProps = {
  row: ServedModelDownloadRow;
  /** The installation's flags: whether a retry may carry the wiring choice. */
  capabilities: ServingCapabilities;
  /** Take a failed download off the table; the section remembers it. */
  onDismiss: (row: ServedModelDownloadRow) => void;
};

/**
 * The actions menu of a download row — the pull's controls where the model's
 * would be. A pull in flight offers **Cancel** (model-manager stops the
 * download; the row leaves with the job). A failed one offers **Retry** — the
 * same pull again: the wiring choice the first one carried where the backend
 * wires, and the preset and node the job names (KServe), so the retry lands
 * in the same cache directory on the same node — and **Dismiss**, which takes
 * the failure off the table without asking the backend anything (the job
 * stays in its list). Outcomes and failures report through toasts; the row
 * has no dialog to hold them.
 */
export function DownloadRowActions({
  row,
  capabilities,
  onDismiss,
}: DownloadRowActionsProps) {
  const toastApi = useApi(toastApiRef);
  const cancel = useCancelJob(row.installation);
  const pull = usePullModel(row.installation);
  const { download } = row;
  const active = download.phase === 'pending' || download.phase === 'running';
  const isPending = cancel.isPending || pull.isPending;

  const onCancel = async () => {
    try {
      await cancel.mutateAsync(download.jobId);
    } catch (failure) {
      toastApi.post({
        title: `Could not cancel the download of ${row.name}`,
        description: (failure as Error).message,
        status: 'danger',
        timeout: TOAST_TIMEOUT_MS * 2,
      });
      return;
    }
    toastApi.post({
      title: `Download of ${row.name} cancelled`,
      status: 'success',
      timeout: TOAST_TIMEOUT_MS,
    });
  };

  const onRetry = async () => {
    try {
      // A backend without `wire` refuses the flag (KServe wires when it
      // serves); one with it gets the first pull's choice back. The preset
      // and node come from the job — what the first pull named, or what
      // model-manager picked for it — so the retry lands where it did.
      await pull.mutateAsync({
        model: row.name,
        ...(capabilities.wire ? { wire: download.wire } : {}),
        ...(row.preset ? { preset: row.preset } : {}),
        ...(row.node ? { node: row.node } : {}),
      });
    } catch (failure) {
      toastApi.post({
        title: `Could not retry the download of ${row.name}`,
        description: (failure as Error).message,
        status: 'danger',
        timeout: TOAST_TIMEOUT_MS * 2,
      });
      return;
    }
    // The new job is the row now; the failure it replaces is done with.
    onDismiss(row);
    toastApi.post({
      title: `Pulling ${row.name} again`,
      status: 'success',
      timeout: TOAST_TIMEOUT_MS,
    });
  };

  let busyLabel: string | undefined;
  if (cancel.isPending) {
    busyLabel = 'Cancelling…';
  } else if (pull.isPending) {
    busyLabel = 'Retrying…';
  }

  return (
    <MenuTrigger>
      <ButtonIcon
        icon={<MoreVertIcon />}
        aria-label={
          busyLabel ? `${busyLabel} ${row.name}` : `Actions for ${row.name}`
        }
        variant="tertiary"
        size="small"
        isDisabled={isPending}
      />
      <Menu>
        {active ? (
          <MenuItem
            color="danger"
            iconStart={<CancelIcon />}
            onAction={() => onCancel()}
          >
            Cancel download
          </MenuItem>
        ) : (
          <>
            <MenuItem iconStart={<ReplayIcon />} onAction={() => onRetry()}>
              Retry download
            </MenuItem>
            <MenuItem iconStart={<ClearIcon />} onAction={() => onDismiss(row)}>
              Dismiss
            </MenuItem>
          </>
        )}
      </Menu>
    </MenuTrigger>
  );
}
