import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
  KubernetesBackendClient,
} from '@backstage/plugin-kubernetes-react';
import { ClusterConfiguration } from './types';
import { ConfigApi, DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import {
  KubernetesRequestBody,
  ObjectsByEntityResponse,
  WorkloadsByEntityRequest,
  CustomObjectsByEntityRequest,
} from '@backstage/plugin-kubernetes-common';

export class KubernetesClient implements KubernetesApi {
  private readonly backendClient: KubernetesBackendClient;
  private readonly configApi: ConfigApi;
  private readonly fetchApi: FetchApi;
  private readonly kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
  private readonly clusters: {
    [clusterName: string]: ClusterConfiguration;
  } = {};

  constructor(options: {
    configApi: ConfigApi;
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
  }) {
    this.backendClient = new KubernetesBackendClient({
      discoveryApi: options.discoveryApi,
      fetchApi: options.fetchApi,
      kubernetesAuthProvidersApi: options.kubernetesAuthProvidersApi,
    });

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
    requestBody: KubernetesRequestBody,
  ): Promise<ObjectsByEntityResponse> {
    return this.backendClient.getObjectsByEntity(requestBody);
  }

  getClusters(): Promise<
    { name: string; authProvider: string; oidcTokenProvider?: string }[]
  > {
    return this.backendClient.getClusters();
  }

  getWorkloadsByEntity(
    request: WorkloadsByEntityRequest,
  ): Promise<ObjectsByEntityResponse> {
    return this.backendClient.getWorkloadsByEntity(request);
  }

  getCustomObjectsByEntity(
    request: CustomObjectsByEntityRequest,
  ): Promise<ObjectsByEntityResponse> {
    return this.backendClient.getCustomObjectsByEntity(request);
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
