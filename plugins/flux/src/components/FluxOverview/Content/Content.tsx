import { useMemo } from 'react';
import { OverviewTree } from '../OverviewTree';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';
import { Progress } from '@backstage/core-components';

type ContentProps = {
  selectedResourceRef: {
    cluster: string;
    namespace: string;
    name: string;
    kind: string;
  } | null;
  treeBuilder: KustomizationTreeBuilder;
  compactView: boolean;
  isLoadingResources: boolean;
};

export const Content = ({
  selectedResourceRef,
  treeBuilder,
  compactView,
  isLoadingResources,
}: ContentProps) => {
  const tree = useMemo(() => treeBuilder.buildTree(), [treeBuilder]);

  if (isLoadingResources) {
    return <Progress />;
  }

  return (
    <OverviewTree
      tree={tree}
      compactView={compactView}
      selectedResourceRef={selectedResourceRef}
    />
  );
};
