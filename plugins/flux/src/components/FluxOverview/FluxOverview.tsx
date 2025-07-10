import {
  useClustersInfo,
  useKustomizations,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box } from '@material-ui/core';
import { KustomizationTreeBuilder } from './utils/KustomizationTreeBuilder';
import { useState } from 'react';
import { Layout } from './Layout';
import { OverviewTree } from './OverviewTree';
import { KustomizationDetails } from './KustomizationDetails';
import { Menu } from './Menu';

export const FluxOverview = () => {
  const [compactView, setCompactView] = useState(true);

  const { clusters, selectedCluster, setSelectedCluster } = useClustersInfo();

  const handleSelectedClusterChange = (selectedItem: string | null) => {
    setSelectedCluster(selectedItem);
  };

  const cluster = 'golem';
  const { resources: kustomizations, isLoading: isLoadingKustomizations } =
    useKustomizations(cluster);

  const treeBuilder = new KustomizationTreeBuilder(kustomizations);
  const tree = treeBuilder.buildTree();

  return (
    <Box display="flex" flexDirection="column">
      <Menu
        clusters={clusters}
        selectedCluster={selectedCluster}
        onSelectedClusterChange={handleSelectedClusterChange}
        compactView={compactView}
        onCompactViewChange={() => setCompactView(!compactView)}
      />

      <Layout
        content={<OverviewTree tree={tree} compactView={compactView} />}
        details={
          <KustomizationDetails
            treeBuilder={treeBuilder}
            kustomizations={kustomizations}
            isLoading={isLoadingKustomizations}
          />
        }
      />
    </Box>
  );
};
