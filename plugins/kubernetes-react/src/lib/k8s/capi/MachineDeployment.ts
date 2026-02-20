import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type MachineDeploymentV1Beta1 = crds.capi.v1beta1.MachineDeployment;
type MachineDeploymentV1Beta2 = crds.capi.v1beta2.MachineDeployment;

type MachineDeploymentVersions = {
  v1beta1: MachineDeploymentV1Beta1;
  v1beta2: MachineDeploymentV1Beta2;
};

type MachineDeploymentInterface =
  MachineDeploymentVersions[keyof MachineDeploymentVersions];

export class MachineDeployment extends KubeObject<MachineDeploymentInterface> {
  static readonly supportedVersions = ['v1beta1', 'v1beta2'] as const;
  static readonly group = 'cluster.x-k8s.io';
  static readonly kind = 'MachineDeployment' as const;
  static readonly plural = 'machinedeployments';

  isV1Beta1(): this is MachineDeployment & {
    jsonData: MachineDeploymentV1Beta1;
  } {
    return this.getApiVersionSuffix() === 'v1beta1';
  }

  isV1Beta2(): this is MachineDeployment & {
    jsonData: MachineDeploymentV1Beta2;
  } {
    return this.getApiVersionSuffix() === 'v1beta2';
  }

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
