import { KubeObject, KubeObjectInterface } from '../KubeObject';

/**
 * The CAPZ managed control plane (AKS). `@giantswarm/k8s-types` does not ship
 * the CAPZ managed CRDs, so this covers the fields the plugins read.
 *
 * `spec.resources` embeds ASO objects (a `ManagedCluster`, and optionally
 * others) as untyped manifests.
 */
export interface AzureASOManagedControlPlaneInterface extends KubeObjectInterface {
  spec?: {
    version?: string;
    resources?: unknown[];
  };
  status?: {
    version?: string;
    ready?: boolean;
    initialized?: boolean;
  };
}

export class AzureASOManagedControlPlane extends KubeObject<AzureASOManagedControlPlaneInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'AzureASOManagedControlPlane' as const;
  static readonly plural = 'azureasomanagedcontrolplanes';

  /**
   * The desired Kubernetes version from `spec.version`, as
   * `ControlPlane.getK8sVersion()` reads it for a KubeadmControlPlane.
   *
   * `spec.version` is optional in CAPZ: when it is unset, the version comes
   * from the embedded ManagedCluster's `spec.kubernetesVersion`, and the
   * controller reports the observed version in `status.version`. That is the
   * fallback.
   */
  getK8sVersion() {
    return this.jsonData.spec?.version ?? this.jsonData.status?.version;
  }
}
