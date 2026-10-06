import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type AWSManagedMachinePoolInterface = crds.capa.v1beta2.AWSManagedMachinePool;

/** An EKS managed node group. */
export class AWSManagedMachinePool extends KubeObject<AWSManagedMachinePoolInterface> {
  static readonly supportedVersions = ['v1beta2'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'AWSManagedMachinePool' as const;
  static readonly plural = 'awsmanagedmachinepools';

  /** Set on the pool, or on its launch template when it uses one. */
  getInstanceType(): string | undefined {
    const spec = this.jsonData.spec;
    return spec?.instanceType ?? spec?.awsLaunchTemplate?.instanceType;
  }
}
