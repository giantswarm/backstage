import React from "react";
import { toSentenceCase } from "../utils/helpers";
import { StatusError, StatusOK, StatusWarning } from "@backstage/core-components";
import { Box } from "@material-ui/core";

export const ClusterStatuses = {
  'Deleting': 'deleting',
  'Creating': 'creating',
  'Ready': 'ready',
} as const;

type ClusterStatusProps = {
  status: string;
}

export const ClusterStatus = ({
  status,
}: ClusterStatusProps) => {
  const statusLabel = toSentenceCase(status);

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
    case ClusterStatuses.Creating:
      return <StatusWarning />;
    
    case ClusterStatuses.Deleting:
      return <StatusError />;
    
    default:
      return <StatusOK />;
  }
}
