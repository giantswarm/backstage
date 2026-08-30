import { mockServices } from '@backstage/backend-test-utils';
import { KubeConfig } from '@kubernetes/client-node';
import { KubernetesClientFactory } from './KubernetesClientFactory';

function makeFactory(kubernetes?: unknown) {
  return new KubernetesClientFactory({
    logger: mockServices.logger.mock(),
    config: mockServices.rootConfig({
      data: kubernetes ? { kubernetes } : {},
    }),
  });
}

const CLUSTERS_CONFIG = {
  clusterLocatorMethods: [
    {
      type: 'config',
      clusters: [
        {
          name: 'gazelle',
          url: 'https://api.gazelle.example',
          caFile: '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
          authProvider: 'oidc',
        },
        {
          name: 'goat',
          url: 'https://api.goat.example',
          authProvider: 'serviceAccount',
          serviceAccountToken: 'sa-token',
        },
      ],
    },
  ],
};

describe('KubernetesClientFactory', () => {
  let loadFromDefault: jest.SpyInstance;

  beforeEach(() => {
    loadFromDefault = jest
      .spyOn(KubeConfig.prototype, 'loadFromDefault')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds an OIDC cluster config with the provided user token', () => {
    const factory = makeFactory(CLUSTERS_CONFIG);

    const kubeConfig = factory.getKubeConfig({
      clusterName: 'gazelle',
      token: 'user-oidc-token',
    });

    expect(kubeConfig.getCurrentCluster()?.server).toBe(
      'https://api.gazelle.example',
    );
    expect(kubeConfig.getCurrentUser()?.token).toBe('user-oidc-token');
    expect(loadFromDefault).not.toHaveBeenCalled();
  });

  it('carries the cluster CA file into the OIDC cluster config', () => {
    const factory = makeFactory(CLUSTERS_CONFIG);

    const kubeConfig = factory.getKubeConfig({
      clusterName: 'gazelle',
      token: 'user-oidc-token',
    });

    expect(kubeConfig.getCurrentCluster()?.caFile).toBe(
      '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
    );
  });

  it('uses the static token for serviceAccount clusters', () => {
    const factory = makeFactory(CLUSTERS_CONFIG);

    const kubeConfig = factory.getKubeConfig({ clusterName: 'goat' });

    expect(kubeConfig.getCurrentCluster()?.server).toBe(
      'https://api.goat.example',
    );
    expect(kubeConfig.getCurrentUser()?.token).toBe('sa-token');
  });

  it('defaults to the first configured cluster when no name is given', () => {
    const factory = makeFactory(CLUSTERS_CONFIG);

    const kubeConfig = factory.getKubeConfig({ token: 'user-oidc-token' });

    expect(kubeConfig.getCurrentCluster()?.server).toBe(
      'https://api.gazelle.example',
    );
  });

  it('falls back to the default kubeconfig for unknown clusters', () => {
    const factory = makeFactory(CLUSTERS_CONFIG);

    factory.getKubeConfig({ clusterName: 'nope', token: 'user-oidc-token' });

    expect(loadFromDefault).toHaveBeenCalled();
  });

  it('falls back to the default kubeconfig for OIDC clusters without a token', () => {
    const factory = makeFactory(CLUSTERS_CONFIG);

    factory.getKubeConfig({ clusterName: 'gazelle' });

    expect(loadFromDefault).toHaveBeenCalled();
  });

  it('falls back to the default kubeconfig when nothing is configured', () => {
    const factory = makeFactory();

    factory.getKubeConfig();

    expect(loadFromDefault).toHaveBeenCalled();
  });
});
