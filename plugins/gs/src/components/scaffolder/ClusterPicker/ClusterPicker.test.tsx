import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
import { ClusterPicker } from './ClusterPicker';

function makeCluster(name: string, namespace: string) {
  return new Cluster(
    {
      apiVersion: 'cluster.x-k8s.io/v1beta1',
      kind: 'Cluster',
      metadata: { name, namespace },
    } as any,
    'gazelle',
  );
}

let mockClusters: Cluster[] = [];

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: () => ({
    resources: mockClusters,
    isLoading: false,
    errors: [],
  }),
  useShowErrors: () => {},
}));

jest.mock('../../clusters/utils', () => ({
  ...jest.requireActual('../../clusters/utils'),
  isManagementCluster: (cluster: Cluster) => cluster.getName() === 'gazelle',
  getClusterOrganization: () => 'giantswarm',
}));

async function renderPicker(uiOptions: Record<string, unknown> = {}) {
  await renderInTestApp(
    <ClusterPicker
      {...({
        onChange: jest.fn(),
        rawErrors: [],
        required: true,
        formData: undefined,
        schema: { title: 'Cluster', description: 'Pick a cluster' },
        uiSchema: {
          'ui:options': { installationName: 'gazelle', ...uiOptions },
        },
        idSchema: { $id: 'cluster' },
        formContext: { formData: {} },
      } as any)}
    />,
  );
}

async function openOptions() {
  await userEvent.type(screen.getByLabelText(/Cluster/), '{arrowdown}');
  return screen.queryAllByRole('option').map(option => option.textContent);
}

describe('ClusterPicker', () => {
  beforeEach(() => {
    mockClusters = [
      makeCluster('gazelle', 'org-giantswarm'),
      makeCluster('operations', 'org-giantswarm'),
    ];
  });

  it('offers the management cluster by default', async () => {
    await renderPicker();

    expect(await openOptions()).toEqual(['gazelle', 'operations']);
  });

  it('offers only workload clusters with excludeManagementClusters', async () => {
    await renderPicker({ excludeManagementClusters: true });

    expect(await openOptions()).toEqual(['operations']);
    expect(screen.getByText('Pick a cluster')).toBeInTheDocument();
  });

  it('explains an empty list when only the management cluster exists', async () => {
    mockClusters = [makeCluster('gazelle', 'org-giantswarm')];

    await renderPicker({ excludeManagementClusters: true });

    expect(
      screen.getByText('No workload clusters on this installation'),
    ).toBeInTheDocument();
  });
});
