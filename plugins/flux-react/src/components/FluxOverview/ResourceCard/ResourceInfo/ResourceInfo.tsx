import { Box, Flex } from '@backstage/ui';
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
  emphasized?: boolean;
};

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
  emphasized = false,
}: ResourceInfoProps) => {
  const inactive = isSuspended || isDependencyNotReady;

  const status = resource ? (
    <ResourceStatus
      readyStatus={readyStatus}
      isDependencyNotReady={isDependencyNotReady}
      isReconciling={isReconciling}
      isSuspended={isSuspended}
      emphasized={emphasized}
    />
  ) : null;

  return (
    <Flex direction="column" gap={emphasized ? '2' : '1'}>
      {emphasized ? (
        // Panel header: keep the status inline right after the heading, so it
        // reads as a badge on the title rather than colliding with the caret
        // pinned to the far right of the accordion trigger.
        <Flex align="center" gap="2">
          <ResourceHeading name={name} inactive={inactive} emphasized />
          {status}
        </Flex>
      ) : (
        <Flex align="baseline" justify="between">
          <ResourceHeading name={name} inactive={inactive} nowrap={nowrap} />

          <Flex align="center" gap="0.5">
            {hasFailingDescendants && (
              <Box
                display="flex"
                title="Contains failing resources"
                style={{ alignItems: 'center', marginRight: resource ? 8 : 0 }}
              >
                <ReportProblemOutlinedIcon
                  style={{
                    color: 'var(--bui-fg-warning)',
                    fontSize: '1.25rem',
                  }}
                />
              </Box>
            )}
            {status}
          </Flex>
        </Flex>
      )}
      <ResourceChips
        kind={kind}
        namespace={namespace}
        cluster={cluster}
        targetCluster={targetCluster}
        emphasized={emphasized}
      />
    </Flex>
  );
};
