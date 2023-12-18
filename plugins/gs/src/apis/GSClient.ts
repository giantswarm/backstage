import { GSApi } from './GSApi';
import { ConfigApi, DiscoveryApi } from '@backstage/core-plugin-api';
import * as k8sUrl from '../model/services/mapi/k8sUrl';
import { ScmAuthApi } from '@backstage/integration-react';
import { ICluster } from '../model/services/mapi/capiv1beta1';
import { IApp } from '../model/services/mapi/applicationv1alpha1';
import { IHelmRelease } from '../model/services/mapi/helmv2beta1';
import { IList } from '../model/services/mapi/metav1';

/**
 * A client for interacting with Giant Swarm Management API.
 *
 * @public
 */
export class GSClient implements GSApi {
  private readonly configApi: ConfigApi;
  private readonly discoveryApi: DiscoveryApi;
  private readonly scmAuthApi: ScmAuthApi;
  private readonly apiEndpoints: {[installationName: string]: string};

  constructor(options: { configApi: ConfigApi; discoveryApi: DiscoveryApi; scmAuthApi: ScmAuthApi }) {
    this.configApi = options.configApi;
    this.discoveryApi = options.discoveryApi;
    this.scmAuthApi = options.scmAuthApi;

    /**
     * Build this.apiEndpoints map
     */
    const installationsConfig = this.configApi.getOptionalConfig('gs.installations');
    if (!installationsConfig) {
      throw new Error(`Missing gs.installations configuration`)
    }
    const apiEndpointsEntries = installationsConfig.keys().map((installationName) => (
      [installationName, installationsConfig.getOptionalString(`${installationName}.apiEndpoint`)]
    ));
    this.apiEndpoints = Object.fromEntries(apiEndpointsEntries);
  }

  private async fetch<T = any>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(response.statusText);

    return await response.json();
  }

  private getApiEndpoint(installationName: string) {
    const apiEndpoint = this.apiEndpoints[installationName];
    if (!apiEndpoint) {
      throw new Error(`Missing API endpoint for ${installationName} installation`)
    }

    return apiEndpoint;
  }

  private async createUrl(options: {
    installationName: string;
    apiVersion: string;
    kind: string;
    namespace?: string;
  }) {
    const proxyBaseURL = await this.discoveryApi.getBaseUrl('proxy');
    const proxyUrl = `${proxyBaseURL}/gs/api/${options.installationName}/`;

    return k8sUrl.create({
      baseUrl: proxyUrl,
      apiVersion: options.apiVersion,
      kind: options.kind,
      namespace: options.namespace,
    });
  }

  private async fetchResource<ResourceType>(options: {
    installationName: string;
    resourceUrl: URL;
  }): Promise<ResourceType> {
    const apiEndpoint = this.getApiEndpoint(options.installationName);
    const { headers } = await this.scmAuthApi.getCredentials({
      url: apiEndpoint,
    });

    const result = await this.fetch<ResourceType>(options.resourceUrl.toString(), { headers } );

    return result;
  }

  private async fetchListResource<ResourceType, ListType extends IList<ResourceType>>(options: {
    installationName: string;
    resourceUrl: URL;
  }): Promise<ResourceType[]> {
    const apiEndpoint = this.getApiEndpoint(options.installationName);
    const { headers } = await this.scmAuthApi.getCredentials({
      url: apiEndpoint,
    });

    const list = await this.fetch<ListType>(options.resourceUrl.toString(), { headers } );

    return list.items;
  }

  async listClusters(options: {
    installationName: string;
    namespace?: string;
  }): Promise<ICluster[]> {
    const resourceUrl = await this.createUrl({
      installationName: options.installationName,
      apiVersion: 'cluster.x-k8s.io/v1beta1',
      kind: 'clusters',
      namespace: options.namespace,
    });

    return this.fetchListResource({ resourceUrl, installationName: options.installationName });
  }

  async listApps(options: {
    installationName: string;
    namespace?: string;
  }): Promise<IApp[]> {
    const resourceUrl = await this.createUrl({
      installationName: options.installationName,
      apiVersion: 'application.giantswarm.io/v1alpha1',
      kind: 'apps',
      namespace: options.namespace,
    });

    return this.fetchListResource({ resourceUrl, installationName: options.installationName });
  }

  async getApp(options: {
    installationName: string;
    namespace: string;
    name: string;
  }): Promise<IApp> {
    const proxyBaseURL = await this.discoveryApi.getBaseUrl('proxy');
    const proxyUrl = `${proxyBaseURL}/gs/api/${options.installationName}/`;

    const resourceUrl = k8sUrl.create({
      baseUrl: proxyUrl,
      apiVersion: 'application.giantswarm.io/v1alpha1',
      kind: 'apps',
      namespace: options.namespace,
      name: options.name,
    });

    return this.fetchResource({ resourceUrl, installationName: options.installationName });
  }

  async listHelmReleases(options: {
    installationName: string;
    namespace?: string;
  }): Promise<IHelmRelease[]> {
    const resourceUrl = await this.createUrl({
      installationName: options.installationName,
      apiVersion: 'helm.toolkit.fluxcd.io/v2beta1',
      kind: 'helmreleases',
      namespace: options.namespace,
    });

    return this.fetchListResource({ resourceUrl, installationName: options.installationName });
  }

  async getHelmRelease(options: {
    installationName: string;
    namespace: string;
    name: string;
  }): Promise<IHelmRelease> {
    const proxyBaseURL = await this.discoveryApi.getBaseUrl('proxy');
    const proxyUrl = `${proxyBaseURL}/gs/api/${options.installationName}/`;

    const resourceUrl = k8sUrl.create({
      baseUrl: proxyUrl,
      apiVersion: 'helm.toolkit.fluxcd.io/v2beta1',
      kind: 'helmreleases',
      namespace: options.namespace,
      name: options.name,
    });

    return this.fetchResource({ resourceUrl, installationName: options.installationName });
  }
}
