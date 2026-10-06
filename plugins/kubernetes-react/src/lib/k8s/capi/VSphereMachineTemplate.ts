import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type VSphereMachineTemplateInterface = crds.capv.v1beta1.VSphereMachineTemplate;

export class VSphereMachineTemplate extends KubeObject<VSphereMachineTemplateInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'VSphereMachineTemplate' as const;
  static readonly plural = 'vspheremachinetemplates';

  /**
   * Unset means the VM inherits the CPU count of the vSphere template it is
   * cloned from, which the CR does not reveal.
   */
  getNumCPUs(): number | undefined {
    return this.jsonData.spec?.template?.spec?.numCPUs;
  }

  /** Unset means the VM inherits the memory of its vSphere template. */
  getMemoryMiB(): number | undefined {
    return this.jsonData.spec?.template?.spec?.memoryMiB;
  }
}
