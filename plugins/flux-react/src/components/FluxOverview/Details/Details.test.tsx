import { ReactNode } from 'react';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Kustomization } from '@giantswarm/backstage-plugin-kubernetes-react';
import { Details } from './Details';

/**
 * Resource cards run a `SelfSubjectAccessReview` through react-query to decide
 * whether to offer the Flux write actions, so they need a QueryClient and a
 * Kubernetes API. Denying access here keeps this suite focused on the details
 * layout; the buttons have their own tests.
 */
async function renderDetails(children: ReactNode) {
  const kubernetesApi = {
    proxy: jest.fn(
      async () =>
        ({
          ok: true,
          status: 201,
          json: async () => ({ status: { allowed: false } }),
        }) as unknown as Response,
    ),
    getObjectsByEntity: jest.fn(),
    getClusters: jest.fn(),
    getCluster: jest.fn(),
    getWorkloadsByEntity: jest.fn(),
    getCustomObjectsByEntity: jest.fn(),
  };

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  await renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <TestApiProvider apis={[[kubernetesApiRef, kubernetesApi]]}>
        {children}
      </TestApiProvider>
    </QueryClientProvider>,
  );
}

function createKustomization(): Kustomization {
  const json = {
    apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
    kind: 'Kustomization',
    metadata: {
      name: 'my-app',
      namespace: 'flux-system',
    },
    spec: {},
    status: {},
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Kustomization(json as any, 'test-installation');
}

const emptyCollections = {
  allKustomizations: [],
  allHelmReleases: [],
  allGitRepositories: [],
  allOCIRepositories: [],
  allHelmRepositories: [],
  allImagePolicies: [],
  allImageRepositories: [],
  allImageUpdateAutomations: [],
};

describe('Details', () => {
  it('shows a loading indicator while resources are loading', async () => {
    await renderInTestApp(
      <Details
        resourceRef={{
          cluster: 'test-installation',
          kind: 'kustomization',
          name: 'my-app',
        }}
        isLoadingResources
        {...emptyCollections}
      />,
    );

    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('shows a not-found message when the resource is missing', async () => {
    await renderInTestApp(
      <Details
        resourceRef={{
          cluster: 'test-installation',
          kind: 'kustomization',
          name: 'my-app',
          namespace: 'flux-system',
        }}
        isLoadingResources={false}
        {...emptyCollections}
      />,
    );

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No Kustomization resources were found/i),
    ).toBeInTheDocument();
  });

  it('renders the Kustomization details for a Kustomization resource', async () => {
    await renderDetails(
      <Details
        resourceRef={{
          cluster: 'test-installation',
          kind: 'kustomization',
          name: 'my-app',
          namespace: 'flux-system',
        }}
        resource={createKustomization()}
        isLoadingResources={false}
        {...emptyCollections}
      />,
    );

    expect(screen.getByText('This Kustomization')).toBeInTheDocument();
    expect(screen.getByText('my-app')).toBeInTheDocument();
  });
});
