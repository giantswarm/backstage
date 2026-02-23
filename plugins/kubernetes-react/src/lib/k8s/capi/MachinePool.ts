import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type MachinePoolInterface = crds.capi.v1beta2.MachinePool;

export class MachinePool extends KubeObject<MachinePoolInterface> {
  static readonly supportedVersions = ['v1beta2'] as const;
  static readonly group = 'cluster.x-k8s.io';
  static readonly kind = 'MachinePool' as const;
  static readonly plural = 'machinepools';

  getDesiredReplicas(): number | undefined {
    return this.jsonData.spec?.replicas;
  }

  getReadyReplicas(): number | undefined {
    return this.jsonData.status?.readyReplicas;
  }

  getPhase(): string | undefined {
    return this.jsonData.status?.phase;
  }

  getInfrastructureRef(): { kind: string; name: string } | undefined {
    const ref = this.jsonData.spec?.template?.spec?.infrastructureRef;
    if (!ref?.kind || !ref?.name) {
      return undefined;
    }
    return { kind: ref.kind, name: ref.name };
  }

  getStatusConditions() {
    return this.jsonData.status?.conditions;
  }
}
