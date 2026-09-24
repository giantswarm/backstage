import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { Button } from '@backstage/ui';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import { HelmRelease } from '@giantswarm/backstage-plugin-kubernetes-react';
import { deploymentsRouteRef } from '../../../../routes';
import { findTargetClusterName } from '../../utils/findTargetCluster';
import { DeploymentDeleteDialog } from './DeploymentDeleteDialog';
import { useDeleteDeployment } from './useDeleteDeployment';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

export function DeleteDeploymentButton({
  deployment,
  installationName,
}: {
  deployment: HelmRelease;
  installationName: string;
}) {
  const [isDialogOpen, setDialogOpen] = useState(false);
  const toastApi = useApi(toastApiRef);
  const navigate = useNavigate();
  const deploymentsRoute = useRouteRef(deploymentsRouteRef);

  const {
    isDeletable,
    isCheckingDeletable,
    deletesChartSource,
    deleteDeployment,
    isDeleting,
    error,
    reset,
  } = useDeleteDeployment(deployment, installationName);

  // Withheld while the checks are still running, not only when they come back
  // negative, so the button never appears and then disappears under the pointer
  // of someone who was never allowed to use it.
  if (!isDeletable || isCheckingDeletable) {
    return null;
  }

  const openDialog = () => {
    // Clear a previous attempt's error, so the dialog does not open still
    // showing it.
    reset();
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await deleteDeployment();
    } catch {
      // Left to the dialog, which stays open and renders the hook's `error`.
      return;
    }

    setDialogOpen(false);
    toastApi.post({
      title: `"${deployment.getName()}" is being uninstalled`,
      status: 'success',
      timeout: TOAST_TIMEOUT_MS,
    });

    if (deploymentsRoute) {
      navigate(deploymentsRoute());
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        iconStart={<DeleteOutlineIcon fontSize="inherit" />}
        onClick={openDialog}
      >
        Uninstall
      </Button>

      <DeploymentDeleteDialog
        deployment={deployment}
        clusterName={findTargetClusterName(deployment)}
        deletesChartSource={deletesChartSource}
        isOpen={isDialogOpen}
        onOpenChange={setDialogOpen}
        isDeleting={isDeleting}
        error={error?.message}
        onConfirm={confirmDelete}
      />
    </>
  );
}
