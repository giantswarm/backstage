import { KubeObject, KubeObjectInterface } from '../KubeObject';

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

/**
 * The CAPZ managed machine pool (an AKS agent pool). `@giantswarm/k8s-types`
 * does not ship the CAPZ managed CRDs, so this covers the fields the plugins
 * read.
 */
export interface AzureASOManagedMachinePoolInterface extends KubeObjectInterface {
  spec?: {
    resources?: AzureASOManagedMachinePoolResource[];
  };
}

/** The API group of the ASO `ManagedClustersAgentPool` kind. */
const AGENT_POOL_API_GROUP = 'containerservice.azure.com';

export class AzureASOManagedMachinePool extends KubeObject<AzureASOManagedMachinePoolInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'AzureASOManagedMachinePool' as const;
  static readonly plural = 'azureasomanagedmachinepools';

  /** The VM size of the embedded ASO `ManagedClustersAgentPool`. */
  getVmSize(): string | undefined {
    const agentPool = (this.jsonData.spec?.resources ?? []).find(
      resource =>
        resource.kind === 'ManagedClustersAgentPool' &&
        resource.apiVersion?.split('/')[0] === AGENT_POOL_API_GROUP,
    );

    return agentPool?.spec?.vmSize;
  }
}
