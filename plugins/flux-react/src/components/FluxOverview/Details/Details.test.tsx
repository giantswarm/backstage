import { ReactNode } from 'react';
import { screen } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  FluxInstance,
  FluxReport,
  Kustomization,
  ResourceSet,
  ResourceSetInputProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { emptyFluxResourceCollections } from '../../../utils/fluxResources';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';
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

function createOperatorObject<T>(
  ResourceClass: new (json: any, cluster: string) => T,
  kind: string,
  name: string,
  spec: Record<string, unknown> = {},
  status: Record<string, unknown> = {},
): T {
  return new ResourceClass(
    {
      apiVersion: 'fluxcd.controlplane.io/v1',
      kind,
      metadata: { name, namespace: 'flux-system' },
      spec,
      status,
    },
    'test-installation',
  );
}

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
        resources={emptyFluxResourceCollections()}
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
        resources={emptyFluxResourceCollections()}
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
        resources={emptyFluxResourceCollections()}
      />,
    );

    expect(screen.getByText('This Kustomization')).toBeInTheDocument();
    expect(screen.getByText('my-app')).toBeInTheDocument();
  });

  describe('Flux Operator kinds', () => {
    const provider = createOperatorObject(
      ResourceSetInputProvider,
      'ResourceSetInputProvider',
      'branches',
      { type: 'GitHubBranch' },
    );
    const resourceSet = createOperatorObject(
      ResourceSet,
      'ResourceSet',
      'apps',
      {
        inputsFrom: [{ name: 'branches' }],
        dependsOn: [
          {
            apiVersion: 'v1',
            kind: 'ResourceSetInputProvider',
            name: 'branches',
            namespace: 'flux-system',
          },
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            name: 'gateway',
            namespace: 'edge',
          },
          {
            apiVersion: 'apiextensions.k8s.io/v1',
            kind: 'CustomResourceDefinition',
            name: 'helmreleases.helm.toolkit.fluxcd.io',
          },
        ],
      },
    );
    const instance = createOperatorObject(
      FluxInstance,
      'FluxInstance',
      'flux',
      {
        distribution: { version: '2.7.x', registry: 'ghcr.io/fluxcd' },
        sync: {
          kind: 'GitRepository',
          url: 'https://x',
          ref: 'main',
          path: '.',
        },
      },
      {
        inventory: {
          entries: [
            {
              id: 'flux-system_fleet-sync_kustomize.toolkit.fluxcd.io_Kustomization',
              v: 'v1',
            },
          ],
        },
      },
    );
    const report = createOperatorObject(FluxReport, 'FluxReport', 'flux');

    const resources = {
      ...emptyFluxResourceCollections(),
      resourceSets: [resourceSet],
      resourceSetInputProviders: [provider],
      fluxInstances: [instance],
      fluxReports: [report],
    };

    const renderFor = (
      resource:
        FluxInstance | ResourceSet | ResourceSetInputProvider | FluxReport,
      treeBuilder?: KustomizationTreeBuilder,
    ) =>
      renderDetails(
        <Details
          resourceRef={{
            cluster: 'test-installation',
            kind: resource.getKind().toLowerCase(),
            name: resource.getName(),
            namespace: 'flux-system',
          }}
          resource={resource}
          resources={resources}
          treeBuilder={treeBuilder}
          isLoadingResources={false}
        />,
      );

    it('shows a ResourceSet with its input providers and dependencies', async () => {
      await renderFor(resourceSet);

      expect(screen.getByText('This ResourceSet')).toBeInTheDocument();
      expect(screen.getByText('Input providers')).toBeInTheDocument();
      // The provider's card under Input providers and Dependencies, and its
      // name in the ResourceSet's own spec.
      expect(screen.getAllByText('branches')).toHaveLength(3);
      expect(screen.getByText('Dependencies')).toBeInTheDocument();
      expect(screen.getByText('Deployment edge/gateway')).toBeInTheDocument();
      expect(
        screen.getByText(
          'CustomResourceDefinition helmreleases.helm.toolkit.fluxcd.io',
        ),
      ).toBeInTheDocument();
    });

    it('shows the ResourceSets using an input provider', async () => {
      await renderFor(provider);

      expect(
        screen.getByText('This ResourceSetInputProvider'),
      ).toBeInTheDocument();
      expect(screen.getByText('Used by')).toBeInTheDocument();
      expect(screen.getByText('apps')).toBeInTheDocument();
    });

    it('shows a FluxInstance with its sync Kustomization and report', async () => {
      const syncKustomization = createKustomization();
      const syncResources = {
        ...resources,
        kustomizations: [
          new Kustomization(
            {
              ...syncKustomization.jsonData,
              metadata: { name: 'fleet-sync', namespace: 'flux-system' },
            } as any,
            'test-installation',
          ),
        ],
      };

      await renderFor(instance, new KustomizationTreeBuilder(syncResources));

      expect(screen.getByText('This FluxInstance')).toBeInTheDocument();
      expect(screen.getByText('Sync')).toBeInTheDocument();
      expect(screen.getByText('fleet-sync')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'FluxReport' }),
      ).toBeInTheDocument();
    });
  });
});
