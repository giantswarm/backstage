import { Link } from 'react-router-dom';
import { useRouteRef } from '@backstage/core-plugin-api';
import { KustomizationTreeNode } from '../utils/KustomizationTreeBuilder';
import { Tree } from '../../UI/Tree';
import { rootRouteRef } from '../../../routes';
import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ResourceNode } from '../ResourceNode';

type OverviewTreeProps = {
  tree: KustomizationTreeNode[];
  compactView: boolean;
  selectedResourceRef?: {
    cluster: string;
    namespace: string;
    name: string;
    kind: string;
  };
};

export const OverviewTree = ({
  tree,
  compactView,
  selectedResourceRef,
}: OverviewTreeProps) => {
  const getBasePath = useRouteRef(rootRouteRef);

  return (
    <Tree
      nodes={tree}
      compactView={compactView}
      sticky
      stickyItemHeight={116}
      renderNode={(nodeData, options) => {
        const highlighted =
          selectedResourceRef &&
          nodeData.cluster === selectedResourceRef.cluster &&
          nodeData.kind.toLowerCase() === selectedResourceRef.kind &&
          nodeData.name === selectedResourceRef.name &&
          nodeData.namespace === selectedResourceRef.namespace;

        const el = (
          <ResourceNode
            name={nodeData.name}
            namespace={nodeData.namespace}
            kind={nodeData.kind}
            cluster={nodeData.cluster}
            targetCluster={nodeData.targetCluster}
            resource={nodeData.resource}
            highlighted={highlighted}
            expandable={options.expandable}
            expanded={options.expanded}
            onExpand={options.onExpand}
          />
        );

        if (
          nodeData.resource &&
          (nodeData.resource.getKind() === Kustomization.kind ||
            nodeData.resource.getKind() === HelmRelease.kind)
        ) {
          const params = new URLSearchParams({
            cluster: nodeData.resource.cluster,
            kind: nodeData.kind.toLowerCase(),
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
