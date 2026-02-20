import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type KarpenterMachinePoolInterface = crds.capa.v1alpha1.KarpenterMachinePool;

export class KarpenterMachinePool extends KubeObject<KarpenterMachinePoolInterface> {
  static readonly supportedVersions = ['v1alpha1'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'KarpenterMachinePool' as const;
  static readonly plural = 'karpentermachinepools';

  getReplicas(): number | undefined {
    return this.jsonData.status?.replicas;
  }

  isReady(): boolean {
    return this.jsonData.status?.ready === true;
  }
}
