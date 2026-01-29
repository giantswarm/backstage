import { core } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type DeploymentInterface = core.apps.v1.Deployment;

export class Deployment extends KubeObject<DeploymentInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly group = 'apps';
  static readonly kind = 'Deployment' as const;
  static readonly plural = 'deployments';

  getStatusConditions() {
    return this.jsonData.status?.conditions;
  }

  findAvailableCondition() {
    const conditions = this.getStatusConditions();
    if (!conditions) {
      return undefined;
    }

    return conditions.find(c => c.type === 'Available');
  }

  isAvailable() {
    const availableCondition = this.findAvailableCondition();
    return availableCondition?.status === 'True';
  }

  getReadyReplicas() {
    return this.jsonData.status?.readyReplicas;
  }

  getReplicas() {
    return this.jsonData.status?.replicas;
  }
}
