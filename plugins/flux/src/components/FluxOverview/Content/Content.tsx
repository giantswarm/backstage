import { useMemo } from 'react';
import { OverviewTree } from '../OverviewTree';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';
import { Progress } from '@backstage/core-components';

type ContentProps = {
  treeBuilder: KustomizationTreeBuilder;
  compactView: boolean;
  isLoadingKustomizations: boolean;
};

export const Content = ({
  treeBuilder,
  compactView,
  isLoadingKustomizations,
}: ContentProps) => {
  const tree = useMemo(() => treeBuilder.buildTree(), [treeBuilder]);

  if (isLoadingKustomizations) {
    return <Progress />;
  }

  return <OverviewTree tree={tree} compactView={compactView} />;
};
