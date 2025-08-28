import { useMemo } from 'react';
import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Button, makeStyles } from '@material-ui/core';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import classNames from 'classnames';
import { ResourceInfo, ResourceWrapper } from '../ResourceCard';

const useStyles = makeStyles(theme => ({
  node: {
    maxWidth: '560px',
    minWidth: '560px',
  },
  expandButton: {
    alignItems: 'flex-start',
    padding: theme.spacing(1),
    paddingTop: '13px',
    minWidth: '40px',

    '& svg': {
      transition: theme.transitions.create('transform'),
    },
  },
  expandButtonExpanded: {
    '& svg': {
      transform: 'rotate(90deg)',
    },
  },
}));

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
    | HelmRepository;
  highlighted?: boolean;
  error?: boolean;
  expandable: boolean;
  expanded: boolean;
  onExpand: () => void;
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
}: ResourceNodeProps) => {
  const classes = useStyles();
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
      className={classes.node}
      highlighted={highlighted}
      error={readyStatus === 'False' || error}
      inactive={inactive}
    >
      <Box display="flex">
        {expandable ? (
          <Button
            className={classNames(classes.expandButton, {
              [classes.expandButtonExpanded]: expanded,
            })}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onExpand();
            }}
          >
            <PlayArrowIcon />
          </Button>
        ) : null}
        <Box
          display="flex"
          flexDirection="column"
          flexGrow={1}
          p={2}
          pt={1}
          pl={expandable ? 1 : '48px'}
          width="100%"
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
            nowrap
          />
        </Box>
      </Box>
    </ResourceWrapper>
  );
};
