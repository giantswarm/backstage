import { Header, Page, Content } from '@backstage/core-components';
import { KubernetesQueryClientProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import { FluxOverview } from '@giantswarm/backstage-plugin-flux-react';
import { CustomKubernetesClustersInfoProvider } from '../../CustomKubernetesClustersInfoProvider';

export const CustomFluxPage = () => {
  return (
    <KubernetesQueryClientProvider>
      <CustomKubernetesClustersInfoProvider>
        <Page themeId="service">
          <Header title="Flux Overview" subtitle="Overview of Flux resources" />
          <Content>
            <FluxOverview routeRef={fluxRouteRef} />
          </Content>
        </Page>
      </CustomKubernetesClustersInfoProvider>
    </KubernetesQueryClientProvider>
  );
};
