import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { findShownClusters } from './utils';

const INSTALLATION = 'golem';

function app(name: string, spec: object, labels: Record<string, string> = {}) {
  return new App(
    {
      apiVersion: 'application.giantswarm.io/v1alpha1',
      kind: 'App',
      metadata: { name, namespace: 'org-test', labels },
      spec,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    INSTALLATION,
  );
}

function helmRelease(
  name: string,
  spec: object,
  labels: Record<string, string> = {},
) {
  return new HelmRelease(
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      metadata: { name, namespace: 'org-test', labels },
      spec,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    INSTALLATION,
  );
}

describe('findShownClusters', () => {
  it('shows each installation as its own management cluster', () => {
    expect(findShownClusters(['golem', 'gaggle'], [])).toEqual({
      golem: ['golem'],
      gaggle: ['gaggle'],
    });
  });

  it('adds the target clusters of the Apps and HelmReleases, once each', () => {
    const deployments = [
      app('cert-manager', { kubeConfig: { inCluster: true } }),
      app(
        'wc1-coredns',
        { kubeConfig: { secret: { name: 'wc1-kubeconfig' } } },
        { 'giantswarm.io/cluster': 'wc1' },
      ),
      helmRelease('flux', {}),
      helmRelease(
        'wc2-ingress',
        { kubeConfig: { secretRef: { name: 'wc2-kubeconfig' } } },
        { 'giantswarm.io/cluster': 'wc2' },
      ),
      helmRelease(
        'wc2-cert-manager',
        { kubeConfig: { secretRef: { name: 'wc2-kubeconfig' } } },
        { 'giantswarm.io/cluster': 'wc2' },
      ),
    ];

    expect(findShownClusters([INSTALLATION], deployments)).toEqual({
      golem: ['golem', 'wc1', 'wc2'],
    });
  });

  it('ignores a deployment of an installation that is not active', () => {
    const deployments = [
      helmRelease(
        'wc2-ingress',
        { kubeConfig: { secretRef: { name: 'wc2-kubeconfig' } } },
        { 'giantswarm.io/cluster': 'wc2' },
      ),
    ];

    expect(findShownClusters(['gaggle'], deployments)).toEqual({
      gaggle: ['gaggle'],
    });
  });
});
