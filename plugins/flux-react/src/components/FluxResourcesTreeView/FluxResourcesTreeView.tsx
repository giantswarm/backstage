import { ReactNode, useCallback } from 'react';
import {
  FluxOverviewDataProvider,
  useFluxOverviewData,
} from '../FluxOverviewDataProvider';
import { FiltersLayout } from '@giantswarm/backstage-plugin-ui-react';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import { FluxOverview } from '../FluxOverview';
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
  } = useFluxOverviewData();

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
          <FluxOverview
            selectedResourceRef={selectedResourceRef}
            onSelectResource={onSelectResource}
          />
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

export const FluxResourcesTreeView = ({
  filters = <DefaultFilters />,
}: {
  filters?: ReactNode;
}) => {
  return (
    <ErrorsProvider>
      <FluxOverviewDataProvider>
        <Content filters={filters} />
      </FluxOverviewDataProvider>
    </ErrorsProvider>
  );
};
