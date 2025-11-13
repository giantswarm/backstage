import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
  KubernetesBackendClient,
} from '@backstage/plugin-kubernetes-react';
import { ClusterConfiguration } from './types';
import { ConfigApi, FetchApi } from '@backstage/core-plugin-api';
import {
  CustomObjectsByEntityRequest,
  KubernetesRequestBody,
  ObjectsByEntityResponse,
  WorkloadsByEntityRequest,
} from '@backstage/plugin-kubernetes-common';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';

export class KubernetesClient implements KubernetesApi {
  private readonly backendClient: KubernetesBackendClient;
  private readonly configApi: ConfigApi;
  private readonly discoveryApi: DiscoveryApiClient;
  private readonly fetchApi: FetchApi;
  private readonly kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
  private clusters: ClusterConfiguration[] | undefined;

  constructor(options: {
    configApi: ConfigApi;
    discoveryApi: DiscoveryApiClient;
    fetchApi: FetchApi;
    kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
  }) {
    this.backendClient = new KubernetesBackendClient({
      discoveryApi: options.discoveryApi,
      fetchApi: options.fetchApi,
      kubernetesAuthProvidersApi: options.kubernetesAuthProvidersApi,
    });

    this.configApi = options.configApi;
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.kubernetesAuthProvidersApi = options.kubernetesAuthProvidersApi;
  }

  getObjectsByEntity(
    requestBody: KubernetesRequestBody,
  ): Promise<ObjectsByEntityResponse> {
    return this.backendClient.getObjectsByEntity(requestBody);
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

  async getCluster(
    clusterName: string,
  ): Promise<ClusterConfiguration | undefined> {
    const clusters = await this.getClusters();
    return clusters.find(cluster => cluster.name === clusterName);
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

  async proxy(options: {
    clusterName: string;
    path: string;
    init?: RequestInit;
  }): Promise<Response> {
    const cluster = await this.getCluster(options.clusterName);
    if (!cluster) {
      throw new Error(`Cluster ${options.clusterName} not found`);
    }
    const { authProvider, oidcTokenProvider } = cluster;
    const kubernetesCredentials = await this.getCredentials(
      authProvider,
      oidcTokenProvider,
    );
    const url = `${await this.discoveryApi.getBaseUrl('kubernetes', cluster.name)}/proxy${
      options.path
    }`;
    const headers = KubernetesClient.getKubernetesHeaders(
      options,
      kubernetesCredentials?.token,
      authProvider,
      oidcTokenProvider,
    );
    return await this.fetchApi.fetch(url, { ...options.init, headers });
  }

  private static getKubernetesHeaders(
    options: {
      clusterName: string;
      path: string;
      init?: RequestInit;
    },
    k8sToken: string | undefined,
    authProvider: string,
    oidcTokenProvider: string | undefined,
  ) {
    const kubernetesAuthHeader =
      KubernetesClient.getKubernetesAuthHeaderByAuthProvider(
        authProvider,
        oidcTokenProvider,
      );
    return {
      ...options.init?.headers,
      [`Backstage-Kubernetes-Cluster`]: options.clusterName,
      ...(k8sToken && {
        [kubernetesAuthHeader]: k8sToken,
      }),
    };
  }

  private static getKubernetesAuthHeaderByAuthProvider(
    authProvider: string,
    oidcTokenProvider: string | undefined,
  ): string {
    let header: string = 'Backstage-Kubernetes-Authorization';

    header = header.concat('-', authProvider);

    if (oidcTokenProvider) header = header.concat('-', oidcTokenProvider);

    return header;
  }
}
