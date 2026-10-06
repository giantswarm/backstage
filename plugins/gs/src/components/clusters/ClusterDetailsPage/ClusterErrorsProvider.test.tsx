import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import {
  App,
  Cluster,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ClusterErrorsProvider } from './ClusterErrorsProvider';
import { isClusterDeleting } from '../utils';
import { ClusterDeletingNotice } from '../ClusterLayout/ClusterLayout';

const mockUseCurrentCluster = jest.fn();

jest.mock('./useCurrentCluster', () => ({
  ...jest.requireActual('./useCurrentCluster'),
  useCurrentCluster: () => mockUseCurrentCluster(),
}));

const INSTALLATION = 'installation-a';
const DELETION_TIMESTAMP = '2026-09-30T10:00:00Z';

function createCluster(deletionTimestamp?: string) {
  return new Cluster(
    {
      apiVersion: 'cluster.x-k8s.io/v1beta2',
      kind: 'Cluster',
      metadata: {
        name: 'my-cluster',
        namespace: 'org-test',
        ...(deletionTimestamp && { deletionTimestamp }),
      },
      spec: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    INSTALLATION,
  );
}

const clusterApp = new App(
  {
    apiVersion: 'application.giantswarm.io/v1alpha1',
    kind: 'App',
    metadata: { name: 'my-cluster', namespace: 'org-test' },
    spec: { name: 'cluster-aws', namespace: 'org-test' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
  INSTALLATION,
);

function namedError(name: string, message: string) {
  const error = new Error(message);
  error.name = name;
  return error;
}

const ReportsErrors = ({ errors }: { errors: Error[] }) => {
  useShowErrors(
    errors.map(error => ({ cluster: INSTALLATION, error, retry: () => {} })),
  );
  return <div>tab content</div>;
};

async function renderTab(cluster: Cluster, errors: Error[]) {
  mockUseCurrentCluster.mockReturnValue({
    cluster,
    clusterApp,
    installationName: INSTALLATION,
    isDeleting: isClusterDeleting(cluster),
  });

  await renderInTestApp(
    <ClusterErrorsProvider>
      <ReportsErrors errors={errors} />
    </ClusterErrorsProvider>,
  );
}

describe('ClusterErrorsProvider', () => {
  it('reports a resource that is not found while the cluster exists', async () => {
    await renderTab(createCluster(), [
      namedError('NotFoundError', 'control plane is gone'),
    ]);

    expect(
      await screen.findByText(/control plane is gone/),
    ).toBeInTheDocument();
  });

  it('does not report a resource that is not found while the cluster is being deleted', async () => {
    await renderTab(createCluster(DELETION_TIMESTAMP), [
      namedError('NotFoundError', 'control plane is gone'),
      namedError('ForbiddenError', 'no access to node pools'),
    ]);

    expect(
      await screen.findByText(/no access to node pools/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText(/control plane is gone/),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText('tab content')).toBeInTheDocument();
  });
});

describe('ClusterDeletingNotice', () => {
  it('says the cluster is being deleted', async () => {
    await renderInTestApp(
      <ClusterDeletingNotice cluster={createCluster(DELETION_TIMESTAMP)} />,
    );

    expect(
      screen.getByText('This cluster is being deleted'),
    ).toBeInTheDocument();
  });

  it('renders nothing for a cluster that is not being deleted', async () => {
    await renderInTestApp(
      <div data-testid="container">
        <ClusterDeletingNotice cluster={createCluster()} />
      </div>,
    );

    expect(screen.getByTestId('container')).toBeEmptyDOMElement();
  });
});
