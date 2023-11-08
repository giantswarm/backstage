import { GSApi } from './GSApi';
import { ConfigApi, DiscoveryApi } from '@backstage/core-plugin-api';
import * as k8sUrl from '../model/services/mapi/k8sUrl';
import { ScmAuthApi } from '@backstage/integration-react';
import { ICluster, IClusterList } from '../model/services/mapi/capiv1beta1';

const MC = 'snail';

/**
 * A client for interacting with Giant Swarm Management API.
 *
 * @public
 */
export class GSClient implements GSApi {
  private readonly configApi: ConfigApi;
  private readonly discoveryApi: DiscoveryApi;
  private readonly scmAuthApi: ScmAuthApi;

  constructor(options: { configApi: ConfigApi; discoveryApi: DiscoveryApi; scmAuthApi: ScmAuthApi }) {
    this.configApi = options.configApi;
    this.discoveryApi = options.discoveryApi;
    this.scmAuthApi = options.scmAuthApi;
  }

  private async fetch<T = any>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(response.statusText);

    return await response.json();
  }

  private async createUrl(options: {
    kind: string;
    apiVersion: string;
    namespace?: string;
  }) {
    const proxyBaseURL = await this.discoveryApi.getBaseUrl('proxy');
    const proxyUrl = `${proxyBaseURL}/gs/api/${MC}/`;

    return k8sUrl.create({
      baseUrl: proxyUrl,
      apiVersion: options.apiVersion,
      kind: options.kind,
      namespace: options.namespace,
    });
  }

  async listClusters(options: {
    namespace?: string;
  }): Promise<ICluster[]> {
    const apiEndpoints = this.configApi.getOptionalConfig('gs.endpoints');
    if (!apiEndpoints) {
      throw new Error('Missing API endpoints configuration for Giant Swarm plugin');
    }

    const apiEndpoint = apiEndpoints.getOptionalString(MC);
    if (!apiEndpoint) {
      throw new Error(`Missing API endpoint for ${MC} MC`)
    }

    const { headers } = await this.scmAuthApi.getCredentials({
      url: apiEndpoint,
    });
    
    const resourceUrl = await this.createUrl({
      apiVersion: 'cluster.x-k8s.io/v1beta1',
      kind: 'clusters',
      namespace: options.namespace,
    });

    const clustersList = await this.fetch<IClusterList>(resourceUrl.toString(), { headers } );

    return clustersList.items;
  }
}
