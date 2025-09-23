import {
  KubernetesApi,
  KubernetesBackendClient,
} from '@backstage/plugin-kubernetes-react';
import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import {
  KubernetesRequestBody,
  ObjectsByEntityResponse,
  WorkloadsByEntityRequest,
  CustomObjectsByEntityRequest,
} from '@backstage/plugin-kubernetes-common';
import { KubernetesAuthProvidersApi } from './KubernetesAuthProviders';
import { GSServiceApi } from '../service';

export class KubernetesClient implements KubernetesApi {
  private readonly backendClient: KubernetesBackendClient;
  private readonly fetchApi: FetchApi;
  private readonly discoveryApi: DiscoveryApi;
  private readonly kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
  private readonly gsServiceApi: GSServiceApi;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
    gsServiceApi: GSServiceApi;
  }) {
    this.backendClient = new KubernetesBackendClient({
      discoveryApi: options.discoveryApi,
      fetchApi: options.fetchApi,
      kubernetesAuthProvidersApi: options.kubernetesAuthProvidersApi,
    });

    this.fetchApi = options.fetchApi;
    this.discoveryApi = options.discoveryApi;
    this.kubernetesAuthProvidersApi = options.kubernetesAuthProvidersApi;
    this.gsServiceApi = options.gsServiceApi;
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
    audience?: string,
  ): Promise<{ token?: string }> {
    if (authProvider === 'oidc') {
      return await this.kubernetesAuthProvidersApi.getCredentials(
        `${authProvider}.${oidcTokenProvider}`,
      );
    }

    if (authProvider === 'pinniped') {
      return await this.kubernetesAuthProvidersApi.getCredentials(
        `${authProvider}.${oidcTokenProvider}`,
        audience,
      );
    }

    return await this.kubernetesAuthProvidersApi.getCredentials(authProvider);
  }

  async getCluster(clusterName: string): Promise<{
    name: string;
    authProvider: string;
    oidcTokenProvider?: string;
  }> {
    let cluster = null;
    try {
      cluster = await this.backendClient.getCluster(clusterName);
    } catch (error) {
      const installationName = clusterName.split('-')[0];
      if (installationName) {
        await this.updateClusters(installationName);
      }
      cluster = await this.backendClient.getCluster(clusterName);
      if (!cluster) {
        return Promise.reject(error);
      }
    }

    return Promise.resolve(cluster);
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
      options.clusterName,
    );

    const url = `${await this.discoveryApi.getBaseUrl('kubernetes')}/proxy${
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

  private async updateClusters(installationName: string): Promise<void> {
    const cluster = await this.getCluster(installationName);
    if (!cluster) {
      throw new Error(`Cluster ${installationName} not found`);
    }

    const { name, authProvider, oidcTokenProvider } = cluster;

    const kubernetesCredentials = await this.getCredentials(
      authProvider,
      oidcTokenProvider,
    );

    const kubernetesHeaders = KubernetesClient.getKubernetesHeaders(
      {
        clusterName: name,
        path: '',
      },
      kubernetesCredentials?.token,
      authProvider,
      oidcTokenProvider,
    ) as Record<string, string>;

    return await this.gsServiceApi.updateClusters(
      installationName,
      kubernetesHeaders,
    );
  }
}
