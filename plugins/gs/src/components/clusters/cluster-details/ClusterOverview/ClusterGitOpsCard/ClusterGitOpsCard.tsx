import React from 'react';
import {
  Box,
  Card,
  CardContent,
  styled,
  Tooltip,
  Typography,
} from '@material-ui/core';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { GitOpsIcon } from '../../../../../assets/icons/CustomIcons';
import { ExternalLink } from '../../../../UI';

const InfoIcon = styled(InfoOutlinedIcon)(({ theme }) => ({
  color: theme.palette.text.secondary,
}));

export function ClusterGitOpsCard() {
  const { cluster, installationName } = useCurrentCluster();

  // const sourceUrl = '#';
  const sourceUrl = undefined;

  const tooltipNote =
    'Source link cannot be provided. Reason: permission not sufficient to  get Kustomization resource named “gazelle-clusters-operations” in namespace “default”.';

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center">
          <Box display="flex" alignItems="center" marginRight={1.5}>
            <GitOpsIcon />
          </Box>
          <Typography variant="inherit">Managed through GitOps</Typography>
          {sourceUrl ? (
            <>
              <Box paddingLeft={1} paddingRight={1}>
                <Typography variant="inherit">·</Typography>
              </Box>
              <ExternalLink href={sourceUrl}>Source</ExternalLink>
            </>
          ) : (
            <Box display="flex" alignItems="center" marginLeft={1.5}>
              <Tooltip title={tooltipNote}>
                <InfoIcon />
              </Tooltip>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
