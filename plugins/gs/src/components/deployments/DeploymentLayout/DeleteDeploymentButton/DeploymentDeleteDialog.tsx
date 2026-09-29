import { Text } from '@backstage/ui';
import { HelmRelease } from '@giantswarm/backstage-plugin-kubernetes-react';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

export type DeploymentDeleteDialogProps = {
  deployment: HelmRelease;
  clusterName?: string;
  deletesChartSource: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isDeleting: boolean;
  error?: string;
  onConfirm: () => void;
};

/**
 * Asks before uninstalling an app.
 *
 * Names the cluster, because the page it opens from is reached from several
 * places and the workloads are what actually go away. Says what is left behind,
 * since that is the part nobody can work out from the page.
 */
export function DeploymentDeleteDialog({
  deployment,
  clusterName,
  deletesChartSource,
  isOpen,
  onOpenChange,
  isDeleting,
  error,
  onConfirm,
}: DeploymentDeleteDialogProps) {
  const name = deployment.getName();

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Uninstall "${name}"?`}
      destructive
      confirmLabel="Uninstall"
      busyLabel="Uninstalling…"
      isBusy={isDeleting}
      error={error}
      onConfirm={onConfirm}
    >
      <Text variant="body-medium">
        Helm removes everything this app runs
        {clusterName ? ` on cluster ${clusterName}` : ''}, including data held
        in volumes it created.
        {deletesChartSource
          ? ' Its chart source is removed as well.'
          : ' Its chart source is shared, so it stays.'}{' '}
        Values stored in ConfigMaps and Secrets stay, and are reused if you
        install this app again.
      </Text>
    </ConfirmDialog>
  );
}
