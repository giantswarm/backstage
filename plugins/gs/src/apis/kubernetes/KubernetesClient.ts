import { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { KubernetesAuthProvidersApi } from '../kubernetes-auth-providers';
import { ClusterConfiguration } from './types';
import { ConfigApi, FetchApi } from '@backstage/core-plugin-api';
import {
  KubernetesRequestBody,
  ObjectsByEntityResponse,
  WorkloadsByEntityRequest,
  CustomObjectsByEntityRequest,
} from '@backstage/plugin-kubernetes-common';

export class KubernetesClient implements KubernetesApi {
  private readonly configApi: ConfigApi;
  private readonly fetchApi: FetchApi;
  private readonly kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
  private readonly clusters: {
    [clusterName: string]: ClusterConfiguration;
  } = {};

  constructor(options: {
    configApi: ConfigApi;
    fetchApi: FetchApi;
    kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
  }) {
    this.configApi = options.configApi;
    this.fetchApi = options.fetchApi;
    this.kubernetesAuthProvidersApi = options.kubernetesAuthProvidersApi;

    const installationsConfig =
      this.configApi.getOptionalConfig('gs.installations');
    if (installationsConfig) {
      const clusters: {
        [clusterName: string]: ClusterConfiguration;
      } = {};

      const installationNames = installationsConfig.keys();
      for (const installationName of installationNames) {
        const installationConfig =
          installationsConfig.getConfig(installationName);
        clusters[installationName] = {
          name: installationName,
          apiEndpoint: installationConfig.getString('apiEndpoint'),
          authProvider: installationConfig.getString('authProvider'),
          oidcTokenProvider:
            installationConfig.getOptionalString('oidcTokenProvider'),
        };
      }

      this.clusters = clusters;
    }
  }

  getObjectsByEntity(
    _requestBody: KubernetesRequestBody,
  ): Promise<ObjectsByEntityResponse> {
    throw new Error('Method not implemented.');
  }

  getClusters(): Promise<
    { name: string; authProvider: string; oidcTokenProvider?: string }[]
  > {
    throw new Error('Method not implemented.');
  }

  getWorkloadsByEntity(
    _request: WorkloadsByEntityRequest,
  ): Promise<ObjectsByEntityResponse> {
    throw new Error('Method not implemented.');
  }

  getCustomObjectsByEntity(
    _request: CustomObjectsByEntityRequest,
  ): Promise<ObjectsByEntityResponse> {
    throw new Error('Method not implemented.');
  }

  private async getCredentials(
    authProvider: string,
    oidcTokenProvider?: string,
  ): Promise<{ token?: string }> {
    return await this.kubernetesAuthProvidersApi.getCredentials(
      authProvider === 'oidc'
        ? `${authProvider}.${oidcTokenProvider}`
        : authProvider,
    );
  }

  async getCluster(clusterName: string): Promise<ClusterConfiguration> {
    return this.clusters[clusterName];
  }

  async proxy(options: {
    clusterName: string;
    path: string;
    init?: RequestInit;
  }): Promise<Response> {
    const cluster = await this.getCluster(options.clusterName);

    if (!cluster) {
      throw new Error(`Cluster ${options.clusterName} not found`);
    }

    const { apiEndpoint, authProvider, oidcTokenProvider } = cluster;

    const kubernetesCredentials = await this.getCredentials(
      authProvider,
      oidcTokenProvider,
    );

    const url = `${apiEndpoint}${options.path}`;
    const headers = {
      Authorization: `Bearer ${kubernetesCredentials.token}`,
      'Content-Type': 'application/json',
    };

    return await this.fetchApi.fetch(url, { ...options.init, headers });
  }
}
