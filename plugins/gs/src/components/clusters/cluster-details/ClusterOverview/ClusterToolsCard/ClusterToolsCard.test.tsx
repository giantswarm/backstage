import {
  mockApis,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { configApiRef } from '@backstage/core-plugin-api';
import { JsonObject } from '@backstage/types';
import { screen } from '@testing-library/react';
import { ClusterToolsCard } from './ClusterToolsCard';

jest.mock('../../../ClusterDetailsPage/useCurrentCluster', () => ({
  useCurrentCluster: () => ({
    installationName: 'installation-a',
    cluster: {},
  }),
}));

jest.mock('../../../utils', () => ({
  ...jest.requireActual('../../../utils'),
  isManagementCluster: () => false,
}));

jest.mock('../../../../hooks', () => ({
  ...jest.requireActual('../../../../hooks'),
  useClusterDetailsTemplateData: () => ({
    CLUSTER_NAME: 'my-cluster',
    CLUSTER_NAMESPACE: 'org-test',
    MC_NAME: 'installation-a',
    ORG_NAME: 'test',
    BASE_DOMAIN: 'example.com',
  }),
}));

function renderWithConfig(data: JsonObject) {
  return renderInTestApp(
    <TestApiProvider apis={[[configApiRef, mockApis.config({ data })]]}>
      <ClusterToolsCard />
    </TestApiProvider>,
  );
}

function linkTargets() {
  return screen.getAllByRole('link').map(link => link.getAttribute('href'));
}

describe('ClusterToolsCard', () => {
  it('offers no Alerts link by default', async () => {
    await renderWithConfig({});

    expect(linkTargets()).toEqual([
      'https://grafana.example.com/d/gs_cluster-overview/cluster-overview?orgId=1&from=now-6h&to=now&timezone=browser&var-datasource=default&var-cluster=my-cluster',
      'https://happa.example.com/organizations/test/clusters/my-cluster',
    ]);
    expect(screen.queryByText('Alerts')).not.toBeInTheDocument();
  });

  it('shows the configured links in place of the defaults', async () => {
    await renderWithConfig({
      gs: {
        clusterDetails: {
          resources: [
            {
              label: 'Alerts',
              icon: 'NotificationsNone',
              url: 'https://grafana.${{BASE_DOMAIN}}/alerting?orgId=2',
            },
            {
              label: 'Web UI',
              icon: 'Public',
              url: 'https://happa.${{BASE_DOMAIN}}',
              clusterType: 'management',
            },
          ],
        },
      },
    });

    expect(screen.getByText('Alerts')).toBeInTheDocument();
    expect(linkTargets()).toEqual([
      'https://grafana.example.com/alerting?orgId=2',
    ]);
  });
});
