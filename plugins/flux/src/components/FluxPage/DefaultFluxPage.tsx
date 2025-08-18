import { ReactNode } from 'react';
import { Content, Header, Page } from '@backstage/core-components';
import {
  KubernetesQueryClientProvider,
  KubernetesClustersInfoProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  FluxOverview,
  FluxOverviewDataProvider,
} from '@giantswarm/backstage-plugin-flux-react';
import { FiltersLayout } from '@giantswarm/backstage-plugin-ui-react';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import { DefaultFilters } from './DefaultFilters';
import { rootRouteRef } from '../../routes';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(() => ({
  content: {
    paddingBottom: 0,
  },
}));

export type BaseFluxPageProps = {
  filters: ReactNode;
  content?: ReactNode;
};

export function BaseFluxPage(props: BaseFluxPageProps) {
  const classes = useStyles();
  const { filters, content = <FluxOverview routeRef={rootRouteRef} /> } = props;

  return (
    <Page themeId="service">
      <Header title="Flux Overview" subtitle="Overview of Flux resources" />
      <Content className={classes.content}>
        <KubernetesQueryClientProvider>
          <KubernetesClustersInfoProvider>
            <ErrorsProvider>
              <FluxOverviewDataProvider>
                <FiltersLayout fullHeight>
                  <FiltersLayout.Filters>{filters}</FiltersLayout.Filters>
                  <FiltersLayout.Content>{content}</FiltersLayout.Content>
                </FiltersLayout>
              </FluxOverviewDataProvider>
            </ErrorsProvider>
          </KubernetesClustersInfoProvider>
        </KubernetesQueryClientProvider>
      </Content>
    </Page>
  );
}

export interface DefaultFluxPageProps {
  emptyContent?: ReactNode;
  filters?: ReactNode;
}

export function DefaultFluxPage(props: DefaultFluxPageProps) {
  const { filters = <DefaultFilters /> } = props;

  return (
    <BaseFluxPage
      filters={filters ?? <DefaultFilters />}
      content={<FluxOverview routeRef={rootRouteRef} />}
    />
  );
}
