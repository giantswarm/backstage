import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import { AWSAccountField } from './AWSAccountField';

const INSTALLATION = 'installation-a';

jest.mock('../../../../ClusterDetailsPage/useCurrentCluster', () => ({
  ...jest.requireActual('../../../../ClusterDetailsPage/useCurrentCluster'),
  useCurrentCluster: () => ({ installationName: INSTALLATION }),
}));

const GROUP = 'infrastructure.cluster.x-k8s.io';

function awsCluster(name: string, identityKind: string) {
  return {
    apiVersion: `${GROUP}/v1beta2`,
    kind: 'AWSCluster',
    metadata: { name, namespace: 'org-test' },
    spec: { identityRef: { kind: identityKind, name: 'default' } },
  };
}

const responses: Record<string, unknown> = {
  [`/apis/${GROUP}`]: {
    name: GROUP,
    versions: [{ groupVersion: `${GROUP}/v1beta2`, version: 'v1beta2' }],
    preferredVersion: { groupVersion: `${GROUP}/v1beta2`, version: 'v1beta2' },
  },
  [`/apis/${GROUP}/v1beta2`]: {
    groupVersion: `${GROUP}/v1beta2`,
    resources: [
      { name: 'awsclusters', kind: 'AWSCluster', namespaced: true },
      {
        name: 'awsclusterroleidentities',
        kind: 'AWSClusterRoleIdentity',
        namespaced: false,
      },
    ],
  },
  [`/apis/${GROUP}/v1beta2/namespaces/org-test/awsclusters/cluster-a/`]:
    awsCluster('cluster-a', 'AWSClusterRoleIdentity'),
  [`/apis/${GROUP}/v1beta2/namespaces/org-test/awsclusters/cluster-b/`]:
    awsCluster('cluster-b', 'AWSClusterControllerIdentity'),
};

const kubernetesApi = {
  proxy: jest.fn(async ({ path }: { path: string }) => {
    if (path in responses) {
      return {
        ok: true,
        status: 200,
        json: async () => responses[path],
      } as Response;
    }
    // The role identity `default` is not readable for this user.
    return { ok: false, status: 403, statusText: '' } as Response;
  }),
};

// Past the 100ms debounce of useShowErrors and any request still in flight.
async function settle() {
  await act(() => new Promise(resolve => setTimeout(resolve, 200)));
}

describe('AWSAccountField', () => {
  it("does not show another cluster's cached identity error for an identity of another kind", async () => {
    // One QueryClient for both clusters, as on the page: the role identity
    // query is keyed by name, so cluster A's 403 for `default` is in the cache
    // when cluster B, whose `default` is a controller identity, renders.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const render = (name: string) =>
      renderInTestApp(
        <TestApiProvider apis={[[kubernetesApiRef, kubernetesApi]]}>
          <QueryClientProvider client={queryClient}>
            <ErrorsProvider>
              <AWSAccountField
                infrastructureRef={{
                  apiGroup: GROUP,
                  kind: 'AWSCluster',
                  name,
                  namespace: 'org-test',
                }}
              />
            </ErrorsProvider>
          </QueryClientProvider>
        </TestApiProvider>,
      );

    const clusterA = await render('cluster-a');
    // The field shows an error icon whose tooltip carries the message.
    expect(
      await screen.findByTitle(/Permission not sufficient/),
    ).toBeInTheDocument();
    clusterA.unmount();

    await render('cluster-b');
    expect(await screen.findByText('n/a')).toBeInTheDocument();
    await settle();

    expect(
      screen.queryByTitle(/Permission not sufficient/),
    ).not.toBeInTheDocument();
  });
});
