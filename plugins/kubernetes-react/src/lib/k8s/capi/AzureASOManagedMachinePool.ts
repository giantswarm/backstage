import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

/**
 * An ASO manifest embedded in `spec.resources`. Only the fields the plugins
 * read are typed; the CRD treats the entries as untyped objects.
 */
export interface AzureASOManagedMachinePoolResource {
  apiVersion?: string;
  kind?: string;
  metadata?: { name?: string };
  spec?: {
    vmSize?: string;
  };
}

/** The CAPZ managed machine pool (an AKS agent pool). */
export type AzureASOManagedMachinePoolInterface =
  crds.capz.v1beta1.AzureASOManagedMachinePool;

/** The API group of the ASO `ManagedClustersAgentPool` kind. */
const AGENT_POOL_API_GROUP = 'containerservice.azure.com';

export class AzureASOManagedMachinePool extends KubeObject<AzureASOManagedMachinePoolInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'AzureASOManagedMachinePool' as const;
  static readonly plural = 'azureasomanagedmachinepools';

  /** The VM size of the embedded ASO `ManagedClustersAgentPool`. */
  getVmSize(): string | undefined {
    const resources = (this.jsonData.spec?.resources ??
      []) as AzureASOManagedMachinePoolResource[];
    const agentPool = resources.find(
      resource =>
        resource.kind === 'ManagedClustersAgentPool' &&
        resource.apiVersion?.split('/')[0] === AGENT_POOL_API_GROUP,
    );

    return agentPool?.spec?.vmSize;
  }
}
