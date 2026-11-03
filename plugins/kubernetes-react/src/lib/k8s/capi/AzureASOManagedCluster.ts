import { crds } from '@giantswarm/k8s-types';
import { ProviderCluster } from './ProviderCluster';

/**
 * An ASO manifest embedded in `spec.resources`. Only the fields the plugins
 * read are typed; the CRD treats the entries as untyped objects.
 */
export interface AzureASOManagedClusterResource {
  apiVersion?: string;
  kind?: string;
  metadata?: { name?: string };
  spec?: {
    location?: string;
  };
}

/** The CAPZ managed infrastructure cluster (AKS). */
export type AzureASOManagedClusterInterface =
  crds.capz.v1beta1.AzureASOManagedCluster;

/** The API group of the ASO `ResourceGroup` kind. */
const RESOURCE_GROUP_API_GROUP = 'resources.azure.com';

export class AzureASOManagedCluster extends ProviderCluster<AzureASOManagedClusterInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'AzureASOManagedCluster' as const;
  static readonly plural = 'azureasomanagedclusters';

  /**
   * Unlike an AzureCluster, the managed cluster has no `spec.location`. The
   * region is the location of the embedded ASO `ResourceGroup`. Without one,
   * or when it has no location (an adopted resource group, say), the region is
   * unknown: the other embedded resources (a virtual network, a peering) may
   * sit in another region, so none of them is a substitute.
   */
  getLocation() {
    const resources = (this.jsonData.spec?.resources ??
      []) as AzureASOManagedClusterResource[];

    const resourceGroup = resources.find(
      resource =>
        resource.kind === 'ResourceGroup' &&
        resource.apiVersion?.split('/')[0] === RESOURCE_GROUP_API_GROUP,
    );

    return resourceGroup?.spec?.location;
  }
}
