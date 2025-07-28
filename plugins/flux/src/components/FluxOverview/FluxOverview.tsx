import {
  HelmRelease,
  Kustomization,
  useClustersInfo,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box } from '@material-ui/core';
import { KustomizationTreeBuilder } from './utils/KustomizationTreeBuilder';
import { useEffect, useMemo, useState } from 'react';
import { Layout } from './Layout';
import { Menu } from './Menu';
import { useSelectedKustomization } from './useSelectedKustomization';
import { Details } from './Details';
import { Content } from './Content';

const RECONCILING_INTERVAL = 3000;
const NON_RECONCILING_INTERVAL = 15000;

export const FluxOverview = () => {
  const [compactView, setCompactView] = useState(true);
  const [refetchInterval, setRefetchInterval] = useState(
    NON_RECONCILING_INTERVAL,
  );

  const { clusters, selectedCluster, setSelectedCluster } = useClustersInfo();

  const handleSelectedClusterChange = (selectedItem: string | null) => {
    setSelectedCluster(selectedItem);
  };

  const cluster = 'golem';
  const { resources: kustomizations, isLoading: isLoadingKustomizations } =
    useResources(cluster, Kustomization, { refetchInterval });

  const { resources: helmReleases, isLoading: isLoadingHelmReleases } =
    useResources(cluster, HelmRelease, { refetchInterval });

  const isLoadingResources = isLoadingKustomizations || isLoadingHelmReleases;

  useEffect(() => {
    const reconciling = kustomizations.some(k => k.isReconciling());

    const newInterval = reconciling
      ? RECONCILING_INTERVAL
      : NON_RECONCILING_INTERVAL;

    if (newInterval !== refetchInterval) {
      setRefetchInterval(newInterval);
    }
  }, [kustomizations, refetchInterval]);

  const selectedKustomizationRef = useSelectedKustomization();
  const selectedKustomization = selectedKustomizationRef
    ? kustomizations.find(
        k =>
          k.cluster === selectedKustomizationRef.cluster &&
          k.getNamespace() === selectedKustomizationRef.namespace &&
          k.getName() === selectedKustomizationRef.name,
      )
    : undefined;

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
            treeBuilder={treeBuilder}
            compactView={compactView}
            isLoadingResources={isLoadingResources}
          />
        }
        details={
          selectedKustomizationRef && (
            <Details
              kustomizationRef={selectedKustomizationRef}
              kustomization={selectedKustomization}
              treeBuilder={treeBuilder}
              allKustomizations={kustomizations}
              isLoadingResources={isLoadingResources}
            />
          )
        }
      />
    </Box>
  );
};
