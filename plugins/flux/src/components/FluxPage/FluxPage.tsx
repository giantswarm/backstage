import { Header, Page, Content } from '@backstage/core-components';
import { KubernetesContext } from '@giantswarm/backstage-plugin-kubernetes-react';
import { FluxOverview } from '../FluxOverview';

export const FluxPage = () => {
  return (
    <KubernetesContext>
      <Page themeId="service">
        <Header title="Flux Overview" subtitle="Overview of Flux resources" />
        <Content>
          <FluxOverview />
        </Content>
      </Page>
    </KubernetesContext>
  );
};
