import { renderInTestApp } from '@backstage/frontend-test-utils';
import { ConfigReader } from '@backstage/config';
import { screen } from '@testing-library/react';
import {
  __resetSignedInConfigForTests,
  setSignedInConfig,
} from '@giantswarm/backstage-plugin-gs-react';
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

function linkTargets() {
  return screen.getAllByRole('link').map(link => link.getAttribute('href'));
}

describe('ClusterToolsCard', () => {
  afterEach(() => {
    __resetSignedInConfigForTests();
  });

  it('renders nothing while the signed-in config loads', async () => {
    await renderInTestApp(<ClusterToolsCard />);

    expect(screen.queryAllByRole('link')).toEqual([]);
  });

  it('offers no Alerts link by default', async () => {
    setSignedInConfig(new ConfigReader({}));

    await renderInTestApp(<ClusterToolsCard />);

    expect(linkTargets()).toEqual([
      'https://grafana.example.com/d/gs_cluster-overview/cluster-overview?orgId=1&from=now-6h&to=now&timezone=browser&var-datasource=default&var-cluster=my-cluster',
      'https://happa.example.com/organizations/test/clusters/my-cluster',
    ]);
    expect(screen.queryByText('Alerts')).not.toBeInTheDocument();
  });

  it('shows the configured links in place of the defaults', async () => {
    setSignedInConfig(
      new ConfigReader({
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
      }),
    );

    await renderInTestApp(<ClusterToolsCard />);

    expect(screen.getByText('Alerts')).toBeInTheDocument();
    expect(linkTargets()).toEqual([
      'https://grafana.example.com/alerting?orgId=2',
    ]);
  });
});
