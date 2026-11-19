import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type MachineDeploymentInterface = crds.capi.v1beta2.MachineDeployment;

/** The cluster-autoscaler's bounds of a node group, as annotations. */
const AUTOSCALER_MIN_SIZE =
  'cluster.x-k8s.io/cluster-api-autoscaler-node-group-min-size';
const AUTOSCALER_MAX_SIZE =
  'cluster.x-k8s.io/cluster-api-autoscaler-node-group-max-size';

export class MachineDeployment extends KubeObject<MachineDeploymentInterface> {
  static readonly supportedVersions = ['v1beta2'] as const;
  static readonly group = 'cluster.x-k8s.io';
  static readonly kind = 'MachineDeployment' as const;
  static readonly plural = 'machinedeployments';

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

  /**
   * The cluster-autoscaler's bounds, where its annotations set both;
   * undefined for a MachineDeployment of a fixed size.
   */
  getAutoscalerRange(): { min: number; max: number } | undefined {
    const annotations = this.getAnnotations();
    const min = Number(annotations?.[AUTOSCALER_MIN_SIZE]);
    const max = Number(annotations?.[AUTOSCALER_MAX_SIZE]);
    return annotations?.[AUTOSCALER_MIN_SIZE] !== undefined &&
      annotations?.[AUTOSCALER_MAX_SIZE] !== undefined &&
      Number.isInteger(min) &&
      Number.isInteger(max)
      ? { min, max }
      : undefined;
  }

  getStatusConditions() {
    return this.jsonData.status?.conditions;
  }
}
