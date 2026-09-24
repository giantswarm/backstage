import { HelmRelease } from '@giantswarm/backstage-plugin-kubernetes-react';
import { getDeploymentOwner } from './getDeploymentOwner';

function createHelmRelease(options: {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}): HelmRelease {
  const json = {
    apiVersion: 'helm.toolkit.fluxcd.io/v2',
    kind: 'HelmRelease',
    metadata: {
      name: 'test-app',
      namespace: 'org-giantswarm',
      labels: options.labels,
      annotations: options.annotations,
    },
    spec: {},
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new HelmRelease(json as any, 'test-installation');
}

describe('getDeploymentOwner', () => {
  it('returns undefined for a deployment with no provenance markers', () => {
    expect(getDeploymentOwner(createHelmRelease({}))).toBeUndefined();
  });

  it('returns undefined for a deployment the portal manages', () => {
    const deployment = createHelmRelease({
      labels: { 'app.kubernetes.io/managed-by': 'giantswarm-backstage' },
    });

    expect(getDeploymentOwner(deployment)).toBeUndefined();
  });

  it('reports Flux when a Kustomization applied the deployment', () => {
    const deployment = createHelmRelease({
      labels: {
        'kustomize.toolkit.fluxcd.io/name': 'customer-apps',
        'kustomize.toolkit.fluxcd.io/namespace': 'flux-system',
      },
    });

    expect(getDeploymentOwner(deployment)).toBe('Flux');
  });

  it('reports Helm when a parent chart rendered the deployment', () => {
    const deployment = createHelmRelease({
      annotations: {
        'meta.helm.sh/release-name': 'umbrella',
        'meta.helm.sh/release-namespace': 'org-giantswarm',
      },
    });

    expect(getDeploymentOwner(deployment)).toBe('Helm');
  });

  it('reports Helm when a parent Flux HelmRelease rendered the deployment', () => {
    const deployment = createHelmRelease({
      labels: { 'helm.toolkit.fluxcd.io/name': 'umbrella' },
    });

    expect(getDeploymentOwner(deployment)).toBe('Helm');
  });

  it('prefers Flux over Helm when both markers are present', () => {
    const deployment = createHelmRelease({
      labels: {
        'kustomize.toolkit.fluxcd.io/name': 'customer-apps',
        'helm.toolkit.fluxcd.io/name': 'umbrella',
      },
    });

    expect(getDeploymentOwner(deployment)).toBe('Flux');
  });

  it('names any other tool that claims the deployment', () => {
    const deployment = createHelmRelease({
      labels: { 'app.kubernetes.io/managed-by': 'agentlab' },
    });

    expect(getDeploymentOwner(deployment)).toBe('agentlab');
  });
});
