import { FluxResourceStatusMixin } from './FluxResourceMixin';
import { FluxResourceStatus } from './FluxResourceStatusManager';
import { KubeObject, KubeObjectInterface } from './KubeObject';

interface FluxObjectInterface extends KubeObjectInterface {
  status?: {
    conditions?: {
      lastTransitionTime: string;
      message: string;
      observedGeneration?: number;
      reason: string;
      status: 'True' | 'False' | 'Unknown';
      type: string;
    }[];
    /**
     * The value of the `reconcile.fluxcd.io/requestedAt` annotation the
     * controller has already acted on. Present on every Flux kind that supports
     * on-demand reconciliation.
     */
    lastHandledReconcileAt?: string;
  };
}

/**
 * The annotation `flux reconcile` sets to request an out-of-band
 * reconciliation.
 */
export const RECONCILE_REQUESTED_AT_ANNOTATION =
  'reconcile.fluxcd.io/requestedAt';

export class FluxObject<
  T extends FluxObjectInterface = any,
> extends KubeObject<T> {
  constructor(json: T, cluster: string) {
    super(json, cluster);
    // Update status in global manager when resource is created
    this.updateFluxStatus();
  }

  getStatusConditions() {
    return this.jsonData.status?.conditions;
  }

  findReadyCondition() {
    const conditions = this.getStatusConditions();
    if (!conditions) {
      return undefined;
    }

    return conditions.find(c => c.type === 'Ready');
  }

  isReconciling() {
    const readyCondition = this.findReadyCondition();

    return (
      readyCondition?.status === 'Unknown' &&
      readyCondition?.reason === 'Progressing'
    );
  }

  isSuspended() {
    return Boolean(this.jsonData.spec?.suspend);
  }

  getReconcileRequestedAt(): string | undefined {
    return this.getAnnotations()?.[RECONCILE_REQUESTED_AT_ANNOTATION];
  }

  getLastHandledReconcileAt(): string | undefined {
    return this.jsonData.status?.lastHandledReconcileAt;
  }

  /**
   * Whether an on-demand reconciliation has been requested but not yet picked up
   * by the controller.
   *
   * Flux compares the `reconcile.fluxcd.io/requestedAt` annotation against
   * `status.lastHandledReconcileAt` and reconciles while they differ, treating
   * the value as an opaque token rather than a time — so this is the resource's
   * own record of a pending request, independent of who triggered it (this UI,
   * the flux CLI, or anyone else) and of any client clock skew.
   */
  isReconcileRequestPending() {
    const requestedAt = this.getReconcileRequestedAt();

    return (
      Boolean(requestedAt) && requestedAt !== this.getLastHandledReconcileAt()
    );
  }

  /**
   * Update status in the global status manager
   */
  updateFluxStatus(): FluxResourceStatus {
    return FluxResourceStatusMixin.updateResourceStatus(this);
  }

  /**
   * Get current status from the global status manager
   */
  getFluxStatus(): FluxResourceStatus | null {
    return FluxResourceStatusMixin.getResourceStatus(this);
  }

  /**
   * Get or calculate current status
   */
  getOrCalculateFluxStatus(): FluxResourceStatus {
    return FluxResourceStatusMixin.getOrCalculateStatus(this);
  }
}
