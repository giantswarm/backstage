import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
import { ClusterPicker } from './ClusterPicker';

const INSTALLATION = 'gazelle';

function makeCluster(
  name: string,
  namespace: string,
  labels: Record<string, string> = {},
) {
  return new Cluster(
    {
      apiVersion: 'cluster.x-k8s.io/v1beta1',
      kind: 'Cluster',
      metadata: { name, namespace, labels },
    } as any,
    INSTALLATION,
  );
}

const managementCluster = () =>
  makeCluster(INSTALLATION, 'org-giantswarm', { app: 'cluster-aws' });
const workloadCluster = () =>
  makeCluster('operations', 'org-giantswarm', { app: 'cluster-aws' });

let mockClusters: Cluster[] = [];
let mockListed = true;

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: () => ({
    resources: mockClusters,
    clustersData: mockListed ? [{ cluster: 'gazelle', data: [] }] : [],
    isLoading: false,
    errors: [],
  }),
  useShowErrors: () => {},
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
          'ui:options': { installationName: INSTALLATION, ...uiOptions },
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
    mockClusters = [managementCluster(), workloadCluster()];
    mockListed = true;
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

  it('explains and disables an empty list when only the management cluster exists', async () => {
    mockClusters = [managementCluster()];

    await renderPicker({ excludeManagementClusters: true });

    expect(
      screen.getByText('No workload clusters on this installation'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Cluster/)).toBeDisabled();
  });

  it('does not claim an empty installation when the list was not fetched', async () => {
    mockClusters = [];
    mockListed = false;

    await renderPicker({ excludeManagementClusters: true });

    expect(
      screen.queryByText('No workload clusters on this installation'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Pick a cluster')).toBeInTheDocument();
  });
});
