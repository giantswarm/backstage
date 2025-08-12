import { Box } from '@material-ui/core';
import {
  Kustomization,
  HelmRelease,
  GitRepository,
  OCIRepository,
  HelmRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ResourceHeading } from '../ResourceHeading';
import { ResourceStatus } from '../ResourceStatus';
import { ResourceChips } from '../ResourceChips';

type ResourceInfoProps = {
  name: string;
  kind: string;
  namespace?: string;
  targetCluster?: string;
  resource?:
    | Kustomization
    | HelmRelease
    | GitRepository
    | OCIRepository
    | HelmRepository;
  readyStatus: 'True' | 'False' | 'Unknown';
  isDependencyNotReady: boolean;
  isReconciling: boolean;
  isSuspended: boolean;
  nowrap?: boolean;
};

export const ResourceInfo = ({
  name,
  kind,
  namespace,
  targetCluster,
  resource,
  readyStatus,
  isDependencyNotReady,
  isReconciling,
  isSuspended,
  nowrap = false,
}: ResourceInfoProps) => {
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

        {resource && (
          <ResourceStatus
            readyStatus={readyStatus}
            isDependencyNotReady={isDependencyNotReady}
            isReconciling={isReconciling}
            isSuspended={isSuspended}
          />
        )}
      </Box>
      <ResourceChips
        kind={kind}
        namespace={namespace}
        targetCluster={targetCluster}
      />
    </Box>
  );
};
