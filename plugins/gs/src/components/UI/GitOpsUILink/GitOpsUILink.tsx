import React from 'react';
import { Box, Link, Typography, Tooltip, styled } from '@material-ui/core';
import LaunchOutlinedIcon from '@material-ui/icons/LaunchOutlined';
import { useGitOpsUIDeepLink } from '../../hooks';

const StyledLaunchOutlinedIcon = styled(LaunchOutlinedIcon)(({ theme }) => ({
  marginLeft: theme.spacing(0.5),
  fontSize: 'inherit',
}));

type GitOpsUILinkProps = {
  installationName: string;
  clusterName?: string;
  kind: string;
  name: string;
  namespace?: string;
  text?: string;
  tooltip?: string;
};

export const GitOpsUILink = ({
  installationName,
  clusterName,
  kind,
  name,
  namespace,
  text,
  tooltip,
}: GitOpsUILinkProps) => {
  let disabledTitle = '';
  if (!clusterName) {
    disabledTitle =
      'GitOps UI link is not available. Cluster name is missing for this resource.';
  }
  if (!namespace) {
    disabledTitle =
      'GitOps UI link is not available. Namespace is missing for this resource.';
  }
  const gitopsUrl = useGitOpsUIDeepLink(
    installationName,
    clusterName ?? '',
    kind,
    name,
    namespace ?? '',
  );
  if (!gitopsUrl) {
    disabledTitle = 'GitOps UI URL is not configured for this installation.';
  }

  const el = (
    <Box display="flex" alignItems="center">
      {text ?? 'GitOps UI'} <StyledLaunchOutlinedIcon />
    </Box>
  );

  if (disabledTitle !== '') {
    return (
      <Tooltip title={disabledTitle}>
        <Typography variant="inherit" color="textSecondary">
          {el}
        </Typography>
      </Tooltip>
    );
  }

  return (
    <Link href={gitopsUrl} target="_blank" rel="noopener noreferrer">
      {tooltip ? <Tooltip title={tooltip}>{el}</Tooltip> : el}
    </Link>
  );
};
