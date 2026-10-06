import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type VSphereMachineTemplateV1Beta1 = crds.capv.v1beta1.VSphereMachineTemplate;
type VSphereMachineTemplateV1Beta2 = crds.capv.v1beta2.VSphereMachineTemplate;

type VSphereMachineTemplateVersions = {
  v1beta1: VSphereMachineTemplateV1Beta1;
  v1beta2: VSphereMachineTemplateV1Beta2;
};

type VSphereMachineTemplateInterface =
  VSphereMachineTemplateVersions[keyof VSphereMachineTemplateVersions];

export class VSphereMachineTemplate extends KubeObject<VSphereMachineTemplateInterface> {
  static readonly supportedVersions = [
    'v1beta1',
    'v1beta2',
  ] as const satisfies readonly (keyof VSphereMachineTemplateVersions)[];
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'VSphereMachineTemplate' as const;
  static readonly plural = 'vspheremachinetemplates';

  isV1Beta1(): this is VSphereMachineTemplate & {
    jsonData: VSphereMachineTemplateV1Beta1;
  } {
    return this.getApiVersionSuffix() === 'v1beta1';
  }

  isV1Beta2(): this is VSphereMachineTemplate & {
    jsonData: VSphereMachineTemplateV1Beta2;
  } {
    return this.getApiVersionSuffix() === 'v1beta2';
  }

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
