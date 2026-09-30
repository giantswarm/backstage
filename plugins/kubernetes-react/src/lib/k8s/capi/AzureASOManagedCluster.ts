import { KubeObjectInterface } from '../KubeObject';
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

/**
 * The CAPZ managed infrastructure cluster (AKS). `@giantswarm/k8s-types` does
 * not ship the CAPZ managed CRDs, so this covers the fields the plugins read.
 */
export interface AzureASOManagedClusterInterface extends KubeObjectInterface {
  spec?: {
    resources?: AzureASOManagedClusterResource[];
  };
  status?: {
    ready?: boolean;
  };
}

export class AzureASOManagedCluster extends ProviderCluster<AzureASOManagedClusterInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'AzureASOManagedCluster' as const;
  static readonly plural = 'azureasomanagedclusters';

  /**
   * Unlike an AzureCluster, the managed cluster has no `spec.location`. The
   * region lives on the embedded ASO `ResourceGroup`; any other embedded
   * resource with a location is the fallback.
   */
  getLocation() {
    const resources = this.jsonData.spec?.resources ?? [];

    const resourceGroup = resources.find(
      resource => resource.kind === 'ResourceGroup',
    );
    if (resourceGroup?.spec?.location) {
      return resourceGroup.spec.location;
    }

    return resources.find(resource => resource.spec?.location)?.spec?.location;
  }
}
