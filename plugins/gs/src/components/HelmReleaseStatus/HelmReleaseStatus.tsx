import React from "react";
import { Box } from "@material-ui/core";
import { useHelmReleaseStatusDetails } from "../hooks/useDeploymentStatusDetails";

type HelmReleaseStatusProps = {
  status: string;
}

export const HelmReleaseStatus = ({
  status,
}: HelmReleaseStatusProps) => {
  const {
    statusIcon: StatusIcon,
    label
  } = useHelmReleaseStatusDetails(status);

  return (
    <Box display="flex" alignItems="center">
      <StatusIcon />
      {label}
    </Box>
  );
}
