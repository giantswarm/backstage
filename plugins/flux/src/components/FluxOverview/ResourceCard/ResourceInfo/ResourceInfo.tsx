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
  isReconciling: boolean;
  isSuspended: boolean;
};

export const ResourceInfo = ({
  name,
  kind,
  namespace,
  targetCluster,
  resource,
  readyStatus,
  isReconciling,
  isSuspended,
}: ResourceInfoProps) => {
  return (
    <Box>
      <Box display="flex" alignItems="baseline" mb={0.5}>
        <ResourceHeading name={name} inactive={isSuspended} />

        {resource && (
          <ResourceStatus
            readyStatus={readyStatus}
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
