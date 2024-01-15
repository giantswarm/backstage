import React from "react";
import { toSentenceCase } from "../utils/helpers";
import { AppStatuses } from "../../model/services/mapi/applicationv1alpha1";
import { HelmReleaseStatuses } from "../../model/services/mapi/helmv2beta1";
import { StatusAborted, StatusError, StatusOK, StatusRunning, StatusWarning } from "@backstage/core-components";
import { Box } from "@material-ui/core";

type DeploymentStatusProps = {
  status: string;
}

export const DeploymentStatus = ({
  status,
}: DeploymentStatusProps) => {
  const statusLabel = toSentenceCase(status.replace(/-/g, ' '));

  return (
    <Box display="flex" alignItems="center">
      <StatusIcon status={status} />
      {statusLabel}
    </Box>
  );
}

function StatusIcon({
  status,
}: {
  status?: string;
}) {
  if (!status) {
    return null
  };

  switch (status) {
    case AppStatuses.Unknown:
    case AppStatuses.Uninstalled:
    case HelmReleaseStatuses.Unknown:
      return <StatusAborted />;

    case AppStatuses.Superseded:
    case AppStatuses.Uninstalling:
    case AppStatuses.PendingInstall:
    case AppStatuses.PendingUpgrade:
    case AppStatuses.PendingRollback:
    case HelmReleaseStatuses.Stalled:
      return <StatusWarning />;

    case HelmReleaseStatuses.Reconciling:
      return <StatusRunning />;

    case AppStatuses.Deployed:
    case HelmReleaseStatuses.Reconciled:
      return <StatusOK />;

    default:
      return <StatusError />;
  }
}
