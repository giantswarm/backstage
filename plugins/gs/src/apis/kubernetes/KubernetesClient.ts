import {
  KubernetesAuthProvidersApi,
  KubernetesBackendClient,
} from '@backstage/plugin-kubernetes-react';
import { ClusterConfiguration } from './types';
import { ConfigApi, DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';

export class KubernetesClient extends KubernetesBackendClient {
  private readonly configApi: ConfigApi;
  private clusters: ClusterConfiguration[] | undefined;

  constructor(options: {
    configApi: ConfigApi;
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
  }) {
    super(options);
    this.configApi = options.configApi;
  }

  getClusters(): Promise<ClusterConfiguration[]> {
    if (this.clusters) {
      return Promise.resolve(this.clusters);
    }

    const installationsConfig =
      this.configApi.getOptionalConfig('gs.installations');
    if (!installationsConfig) {
      throw new Error(`Missing gs.installations configuration`);
    }

    const installations = this.configApi.getConfig('gs.installations').keys();
    this.clusters = installations.map(installation => {
      const installationConfig = installationsConfig.getConfig(installation);
      return {
        name: installation,
        authProvider: installationConfig.getString('authProvider'),
        oidcTokenProvider:
          installationConfig.getOptionalString('oidcTokenProvider'),
      };
    });

    return Promise.resolve(this.clusters);
  }

  async proxy(options: {
    clusterName: string;
    path: string;
    init?: RequestInit;
  }): Promise<Response> {
    let resetInstallation: VoidFunction | undefined = undefined;
    try {
      resetInstallation = DiscoveryApiClient.setInstallation(
        options.clusterName,
      );
      return await super.proxy(options);
    } finally {
      if (resetInstallation) {
        resetInstallation();
      }
    }
  }
}
