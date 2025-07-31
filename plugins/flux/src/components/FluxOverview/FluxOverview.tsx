import {
  Kustomization,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box } from '@material-ui/core';
import { KustomizationTreeBuilder } from './utils/KustomizationTreeBuilder';
import { useMemo, useState } from 'react';
import { Layout } from './Layout';
import { Menu } from './Menu';
import { useSelectedResource } from './useSelectedResource';
import { Details } from './Details';
import { Content } from './Content';
import { useFluxResources } from './useFluxResources';

export const FluxOverview = () => {
  const [compactView, setCompactView] = useState(true);

  const { clusters, selectedCluster, setSelectedCluster } = useClustersInfo();

  const handleSelectedClusterChange = (selectedItem: string | null) => {
    setSelectedCluster(selectedItem);
  };

  const cluster = 'golem';
  const {
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    isLoading,
  } = useFluxResources(cluster);

  const selectedResourceRef = useSelectedResource();
  const selectedResource = useMemo(() => {
    if (!selectedResourceRef) {
      return undefined;
    }

    if (selectedResourceRef.kind === Kustomization.kind.toLowerCase()) {
      return kustomizations.find(
        k =>
          k.cluster === selectedResourceRef.cluster &&
          k.getNamespace() === selectedResourceRef.namespace &&
          k.getName() === selectedResourceRef.name,
      );
    }

    return helmReleases.find(
      h =>
        h.cluster === selectedResourceRef.cluster &&
        h.getNamespace() === selectedResourceRef.namespace &&
        h.getName() === selectedResourceRef.name,
    );
  }, [selectedResourceRef, kustomizations, helmReleases]);

  const treeBuilder = useMemo(
    () => new KustomizationTreeBuilder(kustomizations, helmReleases),
    [helmReleases, kustomizations],
  );

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
        content={
          <Content
            selectedResourceRef={selectedResourceRef}
            treeBuilder={treeBuilder}
            compactView={compactView}
            isLoadingResources={isLoading}
          />
        }
        details={
          selectedResourceRef && (
            <Details
              resourceRef={selectedResourceRef}
              resource={selectedResource}
              treeBuilder={treeBuilder}
              allKustomizations={kustomizations}
              allHelmReleases={helmReleases}
              allGitRepositories={gitRepositories}
              allOCIRepositories={ociRepositories}
              allHelmRepositories={helmRepositories}
              isLoadingResources={isLoading}
            />
          )
        }
      />
    </Box>
  );
};
