import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import { useRouteRef } from '@backstage/core-plugin-api';
import { Box, Button, makeStyles, Paper } from '@material-ui/core';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import { ResourceInfo, ResourceStatus, ResourceWrapper } from '../ResourceCard';
import { KustomizationTreeNode } from '../utils/KustomizationTreeBuilder';
import { Tree } from '../../UI/Tree';
import { rootRouteRef } from '../../../routes';
import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';

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

type OverviewTreeProps = {
  tree: KustomizationTreeNode[];
  compactView: boolean;
};

export const OverviewTree = ({ tree, compactView }: OverviewTreeProps) => {
  const classes = useStyles();
  const navigate = useNavigate();
  const getBasePath = useRouteRef(rootRouteRef);

  const handleClick = useCallback(
    (_nodeId: string, nodeData: { resource?: Kustomization | HelmRelease }) => {
      if (
        nodeData.resource &&
        nodeData.resource.getKind() === Kustomization.kind
      ) {
        const params = new URLSearchParams({
          cluster: nodeData.resource.cluster,
          kind: 'kustomization',
          name: nodeData.resource.getName(),
        });
        const namespace = nodeData.resource.getNamespace();
        if (namespace) {
          params.set('namespace', namespace);
        }

        const detailsPath = `${getBasePath()}?${params.toString()}`;
        navigate(detailsPath);
      }
    },
    [getBasePath, navigate],
  );

  return (
    <Tree
      nodes={tree}
      compactView={compactView}
      sticky
      stickyItemHeight={116}
      renderNode={(nodeId, nodeData, options) => {
        const el = (
          <ResourceWrapper
            className={classes.node}
            onClick={() => {
              handleClick(nodeId, nodeData);
            }}
            highlighted={
              nodeData.name === 'crossplane-providers' ||
              nodeData.name === 'crossplane-compositions'
            }
            error={
              nodeData.name === 'crossplane-compositions' ||
              nodeData.name === 'flux-extras'
            }
          >
            <Box display="flex">
              {options.expandable ? (
                <Button
                  className={classNames(classes.expandButton, {
                    [classes.expandButtonExpanded]: options.expanded,
                  })}
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    options.onExpand();
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
                pl={options.expandable ? 1 : 2}
              >
                <ResourceInfo
                  kind={nodeData.kind}
                  name={nodeData.name}
                  namespace={nodeData.namespace}
                  cluster={nodeData.cluster}
                  targetCluster={nodeData.targetCluster}
                />

                {nodeData.resource && (
                  <ResourceStatus resource={nodeData.resource} />
                )}
              </Box>
            </Box>
          </ResourceWrapper>
        );

        if (
          nodeData.resource &&
          nodeData.resource.getKind() === Kustomization.kind
        ) {
          const params = new URLSearchParams({
            cluster: nodeData.resource.cluster,
            kind: 'kustomization',
            name: nodeData.resource.getName(),
          });
          const namespace = nodeData.resource.getNamespace();
          if (namespace) {
            params.set('namespace', namespace);
          }

          const detailsPath = `${getBasePath()}?${params.toString()}`;

          return <Link to={detailsPath}>{el}</Link>;
        }

        return el;
      }}
    />
  );
};
