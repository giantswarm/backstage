import { ReactNode, useCallback, useMemo } from 'react';
import {
  FluxOverviewDataProvider,
  useFluxOverviewData,
} from '../FluxOverviewDataProvider';
import {
  DetailsPane,
  FiltersLayout,
  useDetailsPane,
} from '@giantswarm/backstage-plugin-ui-react';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import { FluxOverview } from '../FluxOverview';
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
  } = useFluxOverviewData();

  const { open, getParams } = useDetailsPane(FLUX_RESOURCE_PANE_ID, {
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

  const params = getParams();
  const selectedResourceRef = useMemo(() => {
    if (!params.cluster || !params.kind || !params.name) {
      return null;
    }
    return {
      cluster: params.cluster,
      kind: params.kind,
      name: params.name,
      namespace: params.namespace ?? undefined,
    };
  }, [params.cluster, params.kind, params.name, params.namespace]);

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
