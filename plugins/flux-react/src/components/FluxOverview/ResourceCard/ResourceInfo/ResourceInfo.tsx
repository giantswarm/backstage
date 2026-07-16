import { Box, Tooltip, makeStyles } from '@material-ui/core';
import ReportProblemOutlinedIcon from '@material-ui/icons/ReportProblemOutlined';
import {
  Kustomization,
  HelmRelease,
  GitRepository,
  OCIRepository,
  HelmRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ResourceHeading } from '../ResourceHeading';
import { ResourceStatus } from '../ResourceStatus';
import { ResourceChips } from '../ResourceChips';

type ResourceInfoProps = {
  name: string;
  kind: string;
  cluster: string;
  namespace?: string;
  targetCluster?: string;
  resource?:
    | Kustomization
    | HelmRelease
    | GitRepository
    | OCIRepository
    | HelmRepository
    | ImagePolicy
    | ImageRepository
    | ImageUpdateAutomation;
  readyStatus: 'True' | 'False' | 'Unknown';
  isDependencyNotReady: boolean;
  isReconciling: boolean;
  isSuspended: boolean;
  hasFailingDescendants?: boolean;
  nowrap?: boolean;
};

const useStyles = makeStyles(theme => ({
  failingDescendantsIcon: {
    color: theme.palette.warning.main,
    fontSize: '1.25rem',
  },
}));

export const ResourceInfo = ({
  name,
  kind,
  namespace,
  cluster,
  targetCluster,
  resource,
  readyStatus,
  isDependencyNotReady,
  isReconciling,
  isSuspended,
  hasFailingDescendants = false,
  nowrap = false,
}: ResourceInfoProps) => {
  const classes = useStyles();
  const inactive = isSuspended || isDependencyNotReady;

  return (
    <Box>
      <Box
        display="flex"
        alignItems="baseline"
        justifyContent="space-between"
        mb={0.5}
      >
        <ResourceHeading name={name} inactive={inactive} nowrap={nowrap} />

        <Box display="flex" alignItems="center">
          {hasFailingDescendants && (
            <Tooltip title="Contains failing resources">
              <Box display="flex" alignItems="center" mr={resource ? 1 : 0}>
                <ReportProblemOutlinedIcon
                  className={classes.failingDescendantsIcon}
                />
              </Box>
            </Tooltip>
          )}
          {resource && (
            <ResourceStatus
              readyStatus={readyStatus}
              isDependencyNotReady={isDependencyNotReady}
              isReconciling={isReconciling}
              isSuspended={isSuspended}
            />
          )}
        </Box>
      </Box>
      <ResourceChips
        kind={kind}
        namespace={namespace}
        cluster={cluster}
        targetCluster={targetCluster}
      />
    </Box>
  );
};
