import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import {
  HelmRelease,
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { deploymentDetailsExternalRouteRef } from '../../../routes';
import { ModelHelmReleaseCard } from './ModelHelmReleaseCard';

const mockUseResource = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResource: (...args: unknown[]) => mockUseResource(...args),
}));

const FLUX_LABELS = {
  'app.kubernetes.io/managed-by': 'Helm',
  'helm.toolkit.fluxcd.io/name': 'kagent-models',
  'helm.toolkit.fluxcd.io/namespace': 'flux-system',
};
const HELM_ANNOTATIONS = {
  'meta.helm.sh/release-name': 'kagent-models',
  'meta.helm.sh/release-namespace': 'flux-system',
};

function model(
  labels: Record<string, string> = {},
  annotations: Record<string, string> = {},
) {
  return new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: { name: 'sonnet', namespace: 'kagent', labels, annotations },
      spec: { provider: 'Anthropic', model: 'claude-sonnet-4-5' },
    } as ModelConfigInterface,
    'inst-1',
  );
}

function helmRelease(ready: { status: 'True' | 'False'; message: string }) {
  return new HelmRelease(
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      metadata: { name: 'kagent-models', namespace: 'flux-system' },
      spec: {
        interval: '10m',
        chart: {
          spec: {
            chart: 'kagent-models',
            version: '1.2.x',
            sourceRef: { kind: 'HelmRepository', name: 'giantswarm' },
          },
        },
      },
      status: {
        history: [
          {
            chartName: 'kagent-models',
            chartVersion: '1.2.3',
            lastDeployed: '2026-10-01T10:00:00Z',
          },
        ],
        conditions: [
          {
            type: 'Ready',
            reason: ready.status === 'True' ? 'Succeeded' : 'UpgradeFailed',
            lastTransitionTime: '2026-10-01T10:00:00Z',
            ...ready,
          },
        ],
      },
    } as any,
    'inst-1',
  );
}

function renderCard(modelConfig: ModelConfig) {
  return renderInTestApp(
    <ModelHelmReleaseCard modelConfig={modelConfig} installation="inst-1" />,
    {
      mountedRoutes: {
        '/deployments/:installationName/:kind/:namespace/:name':
          deploymentDetailsExternalRouteRef,
      },
    },
  );
}

describe('ModelHelmReleaseCard', () => {
  beforeEach(() => {
    mockUseResource.mockReset();
    mockUseResource.mockReturnValue({
      resource: undefined,
      isLoading: false,
      errors: [],
    });
  });

  it('renders nothing for a model Helm does not own', async () => {
    await renderCard(model());

    expect(screen.queryByText('HelmRelease')).toBeNull();
    // Nothing to read either.
    expect(mockUseResource).toHaveBeenCalledWith(
      'inst-1',
      HelmRelease,
      expect.anything(),
      { enabled: false },
    );
  });

  it('shows the Flux HelmRelease’s chart, version and state, linked to its deployment page', async () => {
    mockUseResource.mockReturnValue({
      resource: helmRelease({ status: 'True', message: 'Upgrade succeeded' }),
      isLoading: false,
      errors: [],
    });
    await renderCard(model(FLUX_LABELS, HELM_ANNOTATIONS));

    expect(mockUseResource).toHaveBeenCalledWith(
      'inst-1',
      HelmRelease,
      { name: 'kagent-models', namespace: 'flux-system' },
      { enabled: true },
    );
    expect(
      screen.getByRole('link', { name: 'flux-system/kagent-models' }),
    ).toHaveAttribute(
      'href',
      '/deployments/inst-1/helmrelease/flux-system/kagent-models',
    );
    expect(screen.getByText('Chart')).toBeInTheDocument();
    // The chart version last applied, not the range asked for.
    expect(screen.getByText('1.2.3')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    // Helm's own name for the release is the HelmRelease's: said once.
    expect(screen.queryByText('Helm release')).toBeNull();
  });

  it('says why a HelmRelease is not ready', async () => {
    mockUseResource.mockReturnValue({
      resource: helmRelease({
        status: 'False',
        message: 'Helm upgrade failed: timed out',
      }),
      isLoading: false,
      errors: [],
    });
    await renderCard(model(FLUX_LABELS, HELM_ANNOTATIONS));

    expect(screen.getByText('Not ready')).toBeInTheDocument();
    expect(
      screen.getByText('Helm upgrade failed: timed out'),
    ).toBeInTheDocument();
  });

  it('shows what the labels name when the HelmRelease cannot be read', async () => {
    mockUseResource.mockReturnValue({
      resource: undefined,
      isLoading: false,
      errors: [{ type: 'error', cluster: 'inst-1', error: new Error('403') }],
    });
    await renderCard(model(FLUX_LABELS, HELM_ANNOTATIONS));

    expect(
      screen.getByRole('link', { name: 'flux-system/kagent-models' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The HelmRelease could not be read, so only what the model’s labels name is shown.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Chart')).toBeNull();
  });

  it('names a release Helm installed without Flux, and reads nothing', async () => {
    await renderCard(model({}, HELM_ANNOTATIONS));

    expect(screen.getByText('Helm release')).toBeInTheDocument();
    expect(screen.getByText('flux-system/kagent-models')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Helm installed this release without a Flux HelmRelease, so there is no release resource to read.',
      ),
    ).toBeInTheDocument();
  });
});
