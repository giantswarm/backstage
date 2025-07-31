import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Button, makeStyles } from '@material-ui/core';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import { ResourceInfo } from '../ResourceCard';
import { ResourceStatus } from '../ResourceCard';
import classNames from 'classnames';
import { useResourceStatus } from '../ResourceCard';
import { ResourceWrapper } from '../ResourceCard';

const useStyles = makeStyles(theme => ({
  node: {
    maxWidth: '560px',
  },
  expandButton: {
    alignItems: 'flex-start',
    padding: theme.spacing(1),
    paddingTop: '21px',
    minWidth: 0,

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
  name: string;
  namespace?: string;
  kind: string;
  cluster: string;
  targetCluster?: string;
  resource?: Kustomization | HelmRelease;
  highlighted?: boolean;
  error?: boolean;
  expandable: boolean;
  expanded: boolean;
  onExpand: () => void;
};

export const ResourceNode = ({
  name,
  namespace,
  kind,
  cluster,
  targetCluster,
  resource,
  highlighted,
  error,
  expandable,
  expanded,
  onExpand,
}: ResourceNodeProps) => {
  const classes = useStyles();
  const { readyStatus, isReconciling, isSuspended } =
    useResourceStatus(resource);

  return (
    <ResourceWrapper
      className={classes.node}
      highlighted={highlighted}
      error={readyStatus === 'False' || error}
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
          position="relative"
          flexGrow={1}
          p={2}
          pl={expandable ? 1 : 2}
        >
          <ResourceInfo
            kind={kind}
            name={name}
            namespace={namespace}
            cluster={cluster}
            targetCluster={targetCluster}
          />

          {resource && (
            <ResourceStatus
              readyStatus={readyStatus}
              isReconciling={isReconciling}
              isSuspended={isSuspended}
            />
          )}
        </Box>
      </Box>
    </ResourceWrapper>
  );
};
