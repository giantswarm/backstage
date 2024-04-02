import React from 'react';
import { Box } from '@material-ui/core';
import { GitOpsUILink } from '../../UI/GitOpsUILink/GitOpsUILink';

type DeploymentActionsProps = {
  installationName: string;
  clusterName?: string;
  kind: string;
  name: string;
  namespace?: string;
};

export const DeploymentActions = ({
  installationName,
  kind,
  name,
  namespace,
}: DeploymentActionsProps) => {
  return (
    <Box display="flex" alignItems="center">
      {kind === 'helmrelease' && (
        <GitOpsUILink
          installationName={installationName}
          clusterName={installationName}
          kind={kind}
          name={name}
          namespace={namespace}
          tooltip="Open this application in the GitOps UI"
        />
      )}
    </Box>
  );
};
