import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import {
  Cluster,
  K8sResponseError,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ClusterErrorsProvider } from './ClusterErrorsProvider';

const mockUseCurrentCluster = jest.fn();

jest.mock('../useCurrentCluster', () => ({
  ...jest.requireActual('../useCurrentCluster'),
  useCurrentCluster: () => mockUseCurrentCluster(),
}));

const INSTALLATION = 'installation-a';

function namedError(
  name: string,
  message: string,
  notFoundName?: string,
): K8sResponseError {
  const error: K8sResponseError = new Error(message);
  error.name = name;
  error.notFoundName = notFoundName;
  return error;
}

const ReportsErrors = ({ errors }: { errors: Error[] }) => {
  useShowErrors(
    errors.map(error => ({ cluster: INSTALLATION, error, retry: () => {} })),
  );
  return <div>tab content</div>;
};

async function renderTab(isDeleting: boolean, errors: Error[]) {
  mockUseCurrentCluster.mockReturnValue({
    cluster: {} as Cluster,
    installationName: INSTALLATION,
    isDeleting,
  });

  await renderInTestApp(
    <ClusterErrorsProvider>
      <ReportsErrors errors={errors} />
    </ClusterErrorsProvider>,
  );
}

describe('ClusterErrorsProvider', () => {
  it('reports an object that is not found while the cluster is live', async () => {
    await renderTab(false, [
      namedError('NotFoundError', 'control plane is gone', 'my-cluster'),
    ]);

    expect(
      await screen.findByText(/control plane is gone/),
    ).toBeInTheDocument();
  });

  it('leaves out an object that is not found while the cluster is being deleted, and reports other errors', async () => {
    await renderTab(true, [
      namedError('NotFoundError', 'control plane is gone', 'my-cluster'),
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

  it('reports an API path the installation does not serve while the cluster is being deleted', async () => {
    await renderTab(true, [
      namedError(
        'NotFoundError',
        'the server could not find the requested resource',
      ),
    ]);

    expect(
      await screen.findByText(/could not find the requested resource/),
    ).toBeInTheDocument();
  });
});
