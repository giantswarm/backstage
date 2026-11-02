import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { HelmRelease } from '@giantswarm/backstage-plugin-kubernetes-react';
import { ClusterReleaseCard } from './ClusterReleaseCard';

const mockUseCurrentCluster = jest.fn();

jest.mock('../../../ClusterDetailsPage/useCurrentCluster', () => ({
  useCurrentCluster: () => mockUseCurrentCluster(),
}));

jest.mock('../../../../hooks', () => ({
  ...jest.requireActual('../../../../hooks'),
  useHelmChartNameForDeployment: () => ({
    chartName: 'cluster-aws',
    isLoading: false,
    errorMessage: undefined,
  }),
}));

function createRelease(ready: { status: string; message: string }) {
  return new HelmRelease(
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      metadata: { name: 'my-cluster', namespace: 'org-test' },
      spec: {},
      status: {
        history: [
          { chartVersion: '3.1.0', lastDeployed: '2026-10-06T10:00:00Z' },
        ],
        conditions: [
          {
            type: 'Ready',
            reason: 'Test',
            lastTransitionTime: '2026-10-06T10:00:00Z',
            ...ready,
          },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    'installation-a',
  );
}

describe('ClusterReleaseCard', () => {
  it('renders nothing for a cluster an App installs', async () => {
    mockUseCurrentCluster.mockReturnValue({
      installationName: 'installation-a',
      clusterRelease: undefined,
    });

    await renderInTestApp(<ClusterReleaseCard />);

    expect(screen.queryByText('Installed by')).not.toBeInTheDocument();
  });

  it("shows the HelmRelease's chart, version and status", async () => {
    mockUseCurrentCluster.mockReturnValue({
      installationName: 'installation-a',
      clusterRelease: createRelease({
        status: 'True',
        message: 'Helm install succeeded',
      }),
    });

    await renderInTestApp(<ClusterReleaseCard />);

    expect(screen.getByText('Installed by')).toBeInTheDocument();
    expect(screen.getByText('my-cluster')).toBeInTheDocument();
    expect(screen.getByText('cluster-aws')).toBeInTheDocument();
    expect(screen.getByText('3.1.0')).toBeInTheDocument();
    expect(screen.getByText('Successful')).toBeInTheDocument();
    expect(
      screen.queryByText('Helm install succeeded'),
    ).not.toBeInTheDocument();
  });

  it('shows the Ready message of a release that is not ready', async () => {
    mockUseCurrentCluster.mockReturnValue({
      installationName: 'installation-a',
      clusterRelease: createRelease({
        status: 'False',
        message: 'install retries exhausted',
      }),
    });

    await renderInTestApp(<ClusterReleaseCard />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('install retries exhausted')).toBeInTheDocument();
  });
});
