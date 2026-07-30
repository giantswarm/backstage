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

/**
 * Annotations with which a Kustomization's *own* manifest opts an object out of
 * being applied, handing it over for manual control.
 *
 * Values from `kustomizev1` in fluxcd/kustomize-controller: `reconcile: disabled`
 * and `ssa: Ignore` exclude the object from apply entirely, and
 * `ssa: IfNotPresent` applies it on create only and never again.
 */
const APPLY_OPT_OUT_ANNOTATIONS: Array<[annotation: string, value: string]> = [
  ['kustomize.toolkit.fluxcd.io/reconcile', 'disabled'],
  ['kustomize.toolkit.fluxcd.io/ssa', 'Ignore'],
  ['kustomize.toolkit.fluxcd.io/ssa', 'IfNotPresent'],
];

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

  findStatusCondition(type: string) {
    const conditions = this.getStatusConditions();
    if (!conditions) {
      return undefined;
    }

    return conditions.find(c => c.type === type);
  }

  findReadyCondition() {
    return this.findStatusCondition('Ready');
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

  /**
   * The managers that server-side apply `spec.suspend`, if any.
   *
   * When this is non-empty the field is under declarative management — typically
   * `kustomize-controller`, when the object itself is deployed from Git by a
   * parent Kustomization whose manifest asserts `spec.suspend`. Flux's SSA always
   * applies with `ForceOwnership`, so that manager silently takes the field back
   * on its next apply and an imperative suspend/resume is undone within one of
   * *its* intervals (not this object's).
   *
   * Note the button a suspend toggle offers always flips away from the current
   * value, and the current value is what the apply-owner last asserted — so
   * whenever this is non-empty, the offered action is precisely the one that
   * would be reverted.
   *
   * Deliberately not restricted to `kustomize-controller`: a `kubectl apply
   * --server-side` by a human, or helm-controller's drift correction when
   * `spec.driftDetection` is enabled, has the same effect. Any SSA applier of the
   * field will revert us.
   *
   * Returns nothing when the object opts out of being applied (see
   * {@link APPLY_OPT_OUT_ANNOTATIONS}). A `managedFields` entry is only ever
   * rewritten by a write, so it outlives the applier: an object handed over for
   * manual control keeps a stale `Apply` entry naming the field, and
   * `ssa: IfNotPresent` objects carry one from creation onwards despite never
   * being applied again. Without this check both would look managed forever.
   *
   * Inherits the SSA-only limitation of {@link KubeObject.getApplyFieldOwners} —
   * a client-side `kubectl apply` or a plain `helm upgrade` that declares
   * `spec.suspend` will still revert us without being detected here.
   */
  getSuspendFieldApplyOwners(): string[] {
    const annotations = this.getAnnotations() ?? {};
    const optedOut = APPLY_OPT_OUT_ANNOTATIONS.some(
      ([annotation, value]) => annotations[annotation] === value,
    );

    if (optedOut) {
      return [];
    }

    return this.getApplyFieldOwners(['spec', 'suspend']);
  }

  /**
   * Whether `spec.suspend` is declaratively managed, and so cannot be changed
   * durably from here. See {@link getSuspendFieldApplyOwners}.
   */
  isSuspendFieldManaged(): boolean {
    return this.getSuspendFieldApplyOwners().length > 0;
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
