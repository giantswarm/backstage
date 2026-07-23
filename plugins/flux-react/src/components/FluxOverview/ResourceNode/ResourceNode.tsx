import { useMemo } from 'react';
import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, ButtonIcon, Flex } from '@backstage/ui';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import { ResourceInfo, ResourceWrapper } from '../ResourceCard';

type ResourceNodeProps = {
  cluster: string;
  name: string;
  namespace?: string;
  kind: string;
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
  highlighted?: boolean;
  error?: boolean;
  expandable: boolean;
  expanded: boolean;
  onExpand: () => void;
  searchMatch?: boolean;
  currentSearchMatch?: boolean;
  hasFailingDescendants?: boolean;
};

export const ResourceNode = ({
  cluster,
  name,
  namespace,
  kind,
  targetCluster,
  resource,
  highlighted,
  error,
  expandable,
  expanded,
  onExpand,
  searchMatch,
  currentSearchMatch,
  hasFailingDescendants,
}: ResourceNodeProps) => {
  const { readyStatus, isDependencyNotReady, isReconciling, isSuspended } =
    useMemo(() => {
      if (!resource) {
        return {
          readyStatus: 'Unknown' as const,
          isDependencyNotReady: false,
          isReconciling: false,
          isSuspended: false,
        };
      }

      return resource.getOrCalculateFluxStatus();
    }, [resource]);

  const inactive = isSuspended || isDependencyNotReady;

  return (
    <ResourceWrapper
      style={{ minWidth: '560px', maxWidth: '560px' }}
      highlighted={highlighted}
      error={readyStatus === 'False' || error}
      inactive={inactive}
      searchMatch={searchMatch}
      currentSearchMatch={currentSearchMatch}
    >
      <Flex align="start" gap="0">
        {expandable ? (
          // The node is wrapped in a tree anchor that React Router resolves to a
          // real href, so an un-prevented click triggers a full-page navigation
          // (reload). Cancel that default in the CAPTURE phase: the bui
          // ButtonIcon (react-aria) calls stopPropagation on the bubbling click,
          // so a bubble-phase onClick on this wrapper would never fire. Capture
          // runs top-down before react-aria sees the event. We must NOT
          // stopPropagation here — that would block react-aria's press
          // activation and the node would stop toggling. Not selecting the
          // resource is already handled by react-aria severing the bubble so the
          // anchor's own onClick never runs.
          <Box
            onClickCapture={e => e.preventDefault()}
            style={{ paddingTop: '5px' }}
          >
            <ButtonIcon
              icon={
                <PlayArrowIcon
                  fontSize="small"
                  style={{
                    transform: expanded ? 'rotate(90deg)' : undefined,
                    transition: 'transform 0.2s',
                  }}
                />
              }
              aria-label={expanded ? 'Collapse' : 'Expand'}
              variant="tertiary"
              size="small"
              onPress={onExpand}
            />
          </Box>
        ) : null}
        <Box
          grow
          p="4"
          pt="2"
          pl={expandable ? '2' : '12'}
          style={{ width: '100%' }}
        >
          <ResourceInfo
            cluster={cluster}
            name={name}
            kind={kind}
            namespace={namespace}
            targetCluster={targetCluster}
            readyStatus={readyStatus}
            isDependencyNotReady={isDependencyNotReady}
            isReconciling={isReconciling}
            isSuspended={isSuspended}
            resource={resource}
            hasFailingDescendants={hasFailingDescendants}
            nowrap
          />
        </Box>
      </Flex>
    </ResourceWrapper>
  );
};
