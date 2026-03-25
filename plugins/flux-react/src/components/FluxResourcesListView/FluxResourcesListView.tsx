import { ReactNode, useCallback } from 'react';
import {
  DetailsPane,
  FiltersLayout,
  useDetailsPane,
} from '@giantswarm/backstage-plugin-ui-react';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  FluxResourcesDataProvider,
  useFluxResourcesData,
} from '../FluxResourcesDataProvider';
import { FluxResourcesTable } from '../FluxResourcesTable';
import { FluxResourceDetails } from '../FluxResourceDetails';
import { DefaultFilters } from './DefaultFilters';

const FLUX_RESOURCE_PANE_ID = 'flux-resource';
const FLUX_RESOURCE_PANE_PREFIX = 'sr';

const Content = ({ filters }: { filters: ReactNode }) => {
  const {
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    imagePolicies,
    imageRepositories,
    imageUpdateAutomations,
    isLoading,
  } = useFluxResourcesData();

  const { open } = useDetailsPane(FLUX_RESOURCE_PANE_ID, {
    prefix: FLUX_RESOURCE_PANE_PREFIX,
  });

  const onSelectResource = useCallback(
    (cluster: string, kind: string, name: string, namespace?: string) => {
      open({
        cluster,
        kind: kind.toLowerCase(),
        name,
        namespace,
      });
    },
    [open],
  );

  return (
    <>
      <FiltersLayout fullHeight>
        <FiltersLayout.Filters>{filters}</FiltersLayout.Filters>
        <FiltersLayout.Content>
          <FluxResourcesTable onSelectResource={onSelectResource} />
        </FiltersLayout.Content>
      </FiltersLayout>

      <DetailsPane
        paneId={FLUX_RESOURCE_PANE_ID}
        prefix={FLUX_RESOURCE_PANE_PREFIX}
        render={({ cluster, kind, name, namespace }) => (
          <FluxResourceDetails
            cluster={cluster}
            kind={kind}
            name={name}
            namespace={namespace}
            kustomizations={kustomizations}
            helmReleases={helmReleases}
            gitRepositories={gitRepositories}
            ociRepositories={ociRepositories}
            helmRepositories={helmRepositories}
            imagePolicies={imagePolicies}
            imageRepositories={imageRepositories}
            imageUpdateAutomations={imageUpdateAutomations}
            isLoading={isLoading}
          />
        )}
      />
    </>
  );
};

export const FluxResourcesListView = ({
  filters = <DefaultFilters />,
}: {
  filters?: ReactNode;
}) => {
  return (
    <ErrorsProvider>
      <FluxResourcesDataProvider>
        <Content filters={filters} />
      </FluxResourcesDataProvider>
    </ErrorsProvider>
  );
};
