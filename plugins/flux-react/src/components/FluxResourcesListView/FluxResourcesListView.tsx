import { ReactNode, useCallback } from 'react';
import { FiltersLayout } from '@giantswarm/backstage-plugin-ui-react';
import {
  ErrorsProvider,
  KubernetesQueryClientProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  FluxResourcesDataProvider,
  useFluxResourcesData,
} from '../FluxResourcesDataProvider';
import { FluxResourcesTable } from '../FluxResourcesTable';
import { DefaultFilters } from './DefaultFilters';
import { SelectedResourceDrawer } from '../FluxOverview/SelectedResourceDrawer';

const Content = ({ filters }: { filters: ReactNode }) => {
  const {
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    isLoading,
    treeBuilder,
    selectedResourceRef,
    setSelectedResource,
    clearSelectedResource,
  } = useFluxResourcesData();

  const onSelectResource = useCallback(
    (cluster: string, kind: string, name: string, namespace?: string) => {
      setSelectedResource({
        cluster,
        kind,
        name,
        namespace,
      });
    },
    [setSelectedResource],
  );

  return (
    <>
      <FiltersLayout fullHeight>
        <FiltersLayout.Filters>{filters}</FiltersLayout.Filters>
        <FiltersLayout.Content>
          <FluxResourcesTable onSelectResource={onSelectResource} />
        </FiltersLayout.Content>
      </FiltersLayout>

      {selectedResourceRef && (
        <SelectedResourceDrawer
          selectedResourceRef={selectedResourceRef}
          kustomizations={kustomizations}
          helmReleases={helmReleases}
          gitRepositories={gitRepositories}
          ociRepositories={ociRepositories}
          helmRepositories={helmRepositories}
          isLoadingResources={isLoading}
          treeBuilder={treeBuilder}
          onClose={() => {
            clearSelectedResource();
          }}
        />
      )}
    </>
  );
};

export const FluxResourcesListView = ({
  filters = <DefaultFilters />,
}: {
  filters: ReactNode;
}) => {
  return (
    <KubernetesQueryClientProvider>
      <ErrorsProvider>
        <FluxResourcesDataProvider>
          <Content filters={filters} />
        </FluxResourcesDataProvider>
      </ErrorsProvider>
    </KubernetesQueryClientProvider>
  );
};
