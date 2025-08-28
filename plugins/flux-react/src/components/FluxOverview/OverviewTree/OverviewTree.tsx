import { Link } from 'react-router-dom';
import {
  KustomizationTreeNode,
  KustomizationTreeNodeData,
} from '../utils/KustomizationTreeBuilder';
import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  FixedSizeTree as Tree,
  TreeWalkerValue,
  TreeWalker,
  FixedSizeNodePublicState,
} from 'react-vtree';
import { ResourceNode } from '../ResourceNode';
import { ListChildComponentProps } from 'react-window';
import { SelectedResourceRef } from '../useSelectedResource';

export type NodeData = Readonly<{
  id: string;
  isOpenByDefault: boolean;
  nestingLevel: number;
}>;

type TreeNode = Readonly<{
  children: TreeNode[];
  id: string;
  nodeData: KustomizationTreeNodeData;
  displayInCompactView: boolean;
}>;

type TreeNodeData = NodeData & KustomizationTreeNodeData;

type NodeMeta = Readonly<{
  nestingLevel: number;
  node: TreeNode;
}>;

const getNodeData = (
  node: TreeNode,
  nestingLevel: number,
): TreeWalkerValue<TreeNodeData, NodeMeta> => {
  return {
    data: {
      id: node.id.toString(),
      isOpenByDefault: true,
      nestingLevel,
      label: node.nodeData.label,
      kind: node.nodeData.kind,
      name: node.nodeData.name,
      namespace: node.nodeData.namespace,
      cluster: node.nodeData.cluster,
      targetCluster: node.nodeData.targetCluster,
      resource: node.nodeData.resource,
      hasChildren: node.nodeData.hasChildren,
      hasChildrenInCompactView: node.nodeData.hasChildrenInCompactView,
    },
    nestingLevel,
    node,
  };
};

type NodePublicState<TData extends NodeData> = Readonly<{
  data: TData;
  setOpen: (state: boolean) => Promise<void>;
}> & {
  isOpen: boolean;
};

type NodeProps<
  TData extends NodeData,
  TNodePublicState extends NodePublicState<TData>,
> = Readonly<
  Omit<ListChildComponentProps, 'data' | 'index'> &
    TNodePublicState & {
      treeData?: any;
    }
>;

const Node = ({
  data,
  isOpen,
  style,
  setOpen,
  treeData,
}: NodeProps<TreeNodeData, FixedSizeNodePublicState<TreeNodeData>>) => {
  const highlighted =
    treeData.selectedResourceRef &&
    data.kind.toLowerCase() === treeData.selectedResourceRef.kind &&
    data.name === treeData.selectedResourceRef.name &&
    data.namespace === treeData.selectedResourceRef.namespace;

  const expandable = treeData.compactView
    ? data.hasChildrenInCompactView
    : data.hasChildren;

  const el = (
    <ResourceNode
      cluster={data.cluster}
      name={data.name}
      namespace={data.namespace}
      kind={data.kind}
      targetCluster={data.targetCluster}
      resource={data.resource}
      highlighted={highlighted}
      expandable={expandable}
      expanded={isOpen}
      onExpand={() => setOpen(!isOpen)}
    />
  );

  const showLink =
    data.kind === Kustomization.kind || data.kind === HelmRelease.kind;

  return (
    <div
      style={{
        ...style,
        paddingLeft: 32 * data.nestingLevel,
        paddingTop: 4,
        paddingBottom: 4,
      }}
    >
      {showLink ? (
        <Link
          to="#"
          style={{ display: 'inline-block' }}
          onClick={e => {
            e.preventDefault();
            treeData.onSelectResource(
              data.cluster,
              data.kind,
              data.name,
              data.namespace,
            );
          }}
        >
          {el}
        </Link>
      ) : (
        el
      )}
    </div>
  );
};

type OverviewTreeProps = {
  tree: KustomizationTreeNode[];
  compactView: boolean;
  selectedResourceRef?: SelectedResourceRef | null;
  height: number;
  onSelectResource: (
    cluster: string,
    kind: string,
    name: string,
    namespace?: string,
  ) => void;
};

export const OverviewTree = ({
  tree,
  compactView,
  selectedResourceRef,
  height,
  onSelectResource,
}: OverviewTreeProps) => {
  const treeNodes = tree;

  function* treeWalker(): ReturnType<TreeWalker<TreeNodeData, NodeMeta>> {
    // Step [1]: Define the root node of our tree. There can be one or
    // multiple nodes.
    for (let i = 0; i < treeNodes.length; i++) {
      if (!compactView || treeNodes[i].displayInCompactView) {
        yield getNodeData(treeNodes[i], 0);
      }
    }

    while (true) {
      // Step [2]: Get the parent component back. It will be the object
      // the `getNodeData` function constructed, so you can read any data from it.
      const parent = yield;

      for (let i = 0; i < parent.node.children.length; i++) {
        // Step [3]: Yielding all the children of the provided component. Then we
        // will return for the step [2] with the first children.
        if (!compactView || parent.node.children[i].displayInCompactView) {
          yield getNodeData(parent.node.children[i], parent.nestingLevel + 1);
        }
      }
    }
  }

  return (
    <Tree
      async
      treeWalker={treeWalker}
      itemSize={100}
      itemData={{
        selectedResourceRef,
        compactView,
        onSelectResource,
      }}
      height={height}
      width="100%"
    >
      {Node}
    </Tree>
  );
};
