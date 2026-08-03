import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import {
  ErrorsProvider,
  GitRepository,
  HelmRelease,
  KubeObject,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { GitOpsCard } from './GitOpsCard';

const mockUseResource = jest.fn();

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResource: (...args: unknown[]) => mockUseResource(...args),
}));

const KUSTOMIZE_LABELS = {
  'kustomize.toolkit.fluxcd.io/name': 'agents',
  'kustomize.toolkit.fluxcd.io/namespace': 'flux-giantswarm',
};

const HELM_LABELS = {
  'helm.toolkit.fluxcd.io/name': 'pr-reviewer',
  'helm.toolkit.fluxcd.io/namespace': 'agentic-platform',
};

/** Any reconciled object; only its labels matter to the card. */
function makeResource(labels: Record<string, string>): KubeObject {
  return new KubeObject(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'Agent',
      metadata: { name: 'pr-reviewer', namespace: 'agentic-platform', labels },
    } as never,
    'gazelle',
  );
}

function makeHelmRelease(labels: Record<string, string> = {}) {
  return new HelmRelease(
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      metadata: { name: 'pr-reviewer', namespace: 'agentic-platform', labels },
      spec: {},
    } as never,
    'gazelle',
  );
}

function makeKustomization() {
  return new Kustomization(
    {
      apiVersion: 'kustomize.toolkit.fluxcd.io/v1',
      kind: 'Kustomization',
      metadata: { name: 'agents', namespace: 'flux-giantswarm' },
      spec: {
        path: 'management-clusters/gazelle/extras',
        sourceRef: { kind: 'GitRepository', name: 'management-clusters' },
      },
    } as never,
    'gazelle',
  );
}

function makeGitRepository() {
  return new GitRepository(
    {
      apiVersion: 'source.toolkit.fluxcd.io/v1',
      kind: 'GitRepository',
      metadata: { name: 'management-clusters', namespace: 'flux-giantswarm' },
      spec: { url: 'https://github.com/giantswarm/management-clusters' },
      status: { artifact: { revision: 'main@sha1:abc123' } },
    } as never,
    'gazelle',
  );
}

type Chain = {
  helmRelease?: unknown;
  kustomization?: unknown;
  gitRepository?: unknown;
};

function stubChain(chain: Chain) {
  const outcome = (resource: unknown) => ({
    resource,
    isLoading: false,
    error: null,
    errors: [],
    incompatibilities: [],
    discoveryErrors: [],
    clientOutdatedStates: [],
  });

  mockUseResource.mockImplementation(
    (_cluster: string, ResourceClass: unknown) => {
      switch (ResourceClass) {
        case HelmRelease:
          return outcome(chain.helmRelease);
        case Kustomization:
          return outcome(chain.kustomization);
        case GitRepository:
          return outcome(chain.gitRepository);
        default:
          return outcome(undefined);
      }
    },
  );
}

const renderCard = (resource: KubeObject) =>
  renderInTestApp(
    <ErrorsProvider>
      <GitOpsCard resource={resource} installationName="gazelle" />
    </ErrorsProvider>,
  );

describe('GitOpsCard', () => {
  beforeEach(() => {
    mockUseResource.mockReset();
  });

  describe('when the resource is applied by a Kustomization', () => {
    it('claims GitOps and links to the source', async () => {
      stubChain({
        kustomization: makeKustomization(),
        gitRepository: makeGitRepository(),
      });

      await renderCard(makeResource(KUSTOMIZE_LABELS));

      expect(screen.getByText('Managed through GitOps')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Source/ })).toHaveAttribute(
        'href',
        expect.stringContaining('management-clusters/gazelle/extras'),
      );
    });
  });

  // An object rendered by a Helm chart carries only the release it came from, so
  // the Kustomization has to be found on the HelmRelease one level up.
  describe('when the resource is rendered by a HelmRelease', () => {
    it('follows the release to the Kustomization and links to the source', async () => {
      stubChain({
        helmRelease: makeHelmRelease(KUSTOMIZE_LABELS),
        kustomization: makeKustomization(),
        gitRepository: makeGitRepository(),
      });

      await renderCard(makeResource(HELM_LABELS));

      expect(screen.getByText('Managed through GitOps')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Source/ })).toBeInTheDocument();
    });

    // Reconciled by Flux, but nothing in Git describes it — a release applied by
    // hand or by a scaffolder action. Claiming GitOps here would send the reader
    // looking for a file that does not exist.
    it('renders nothing when the release itself is not in Git', async () => {
      stubChain({ helmRelease: makeHelmRelease() });

      const { container } = await renderCard(makeResource(HELM_LABELS));

      expect(
        screen.queryByText('Managed through GitOps'),
      ).not.toBeInTheDocument();
      expect(container).toBeEmptyDOMElement();
    });
  });

  it('renders nothing for a resource with no Flux labels at all', async () => {
    stubChain({});

    const { container } = await renderCard(makeResource({}));

    expect(container).toBeEmptyDOMElement();
  });
});
