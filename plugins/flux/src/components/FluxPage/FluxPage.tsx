import { Header, Page, Content } from '@backstage/core-components';
import {
  KubernetesQueryClientProvider,
  KubernetesClustersInfoProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { FluxOverview } from '@giantswarm/backstage-plugin-flux-react';
import { rootRouteRef } from '../../routes';

export const FluxPage = () => {
  return (
    <KubernetesQueryClientProvider>
      <KubernetesClustersInfoProvider>
        <Page themeId="service">
          <Header title="Flux Overview" subtitle="Overview of Flux resources" />
          <Content>
            <FluxOverview routeRef={rootRouteRef} />
          </Content>
        </Page>
      </KubernetesClustersInfoProvider>
    </KubernetesQueryClientProvider>
  );
};
