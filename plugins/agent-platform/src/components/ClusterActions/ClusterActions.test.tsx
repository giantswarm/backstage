import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import type { ClusterPageTarget } from '@giantswarm/backstage-plugin-gs';
import { CLUSTER_MANAGER_TOOLS } from '../../lib/clusterManager';
import { DeleteClusterAction } from './ClusterActions';

let mockTarget: ClusterPageTarget | undefined;

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useClusterPageTarget: () => mockTarget,
  useInstallations: () => ({ installations: [] }),
}));

jest.mock('../../hooks/useClusterManager', () => ({
  useClusterManagerAvailability: () => ({ presenceOf: () => 'available' }),
  useClusterManagerInfo: () => ({
    info: {
      tools: [CLUSTER_MANAGER_TOOLS.deleteCluster],
      modes: {},
    },
    isLoading: false,
    error: null,
  }),
  useInstallationsOffering: () => [],
}));

jest.mock('../DeleteClusterDialog', () => ({
  DeleteClusterDialog: () => null,
}));

function target(overrides: Partial<ClusterPageTarget> = {}): ClusterPageTarget {
  return {
    installationName: 'installation-a',
    name: 'my-cluster',
    namespace: 'org-test',
    organization: 'test',
    isManagementCluster: false,
    isDeleting: false,
    ...overrides,
  };
}

describe('DeleteClusterAction', () => {
  it('offers Delete for a workload cluster', async () => {
    mockTarget = target();

    await renderInTestApp(<DeleteClusterAction />);

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('does not offer Delete for a cluster already being deleted', async () => {
    mockTarget = target({ isDeleting: true });

    await renderInTestApp(<DeleteClusterAction />);

    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
  });
});
