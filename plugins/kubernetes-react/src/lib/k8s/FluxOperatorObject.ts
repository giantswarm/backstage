import { FluxObject, FluxObjectInterface } from './FluxObject';

/**
 * The annotation with which Flux Operator objects are suspended (`disabled`)
 * and resumed (`enabled`). Unlike the toolkit kinds they have no
 * `spec.suspend`.
 */
export const FLUX_OPERATOR_RECONCILE_ANNOTATION =
  'fluxcd.controlplane.io/reconcile';

/**
 * Who suspended a Flux Operator object, as recorded by the Flux Operator's own
 * UI and CLI.
 */
const SUSPENDED_BY_ANNOTATION = 'fluxcd.controlplane.io/suspendedBy';

/**
 * A point-in-time record of a reconciliation, from `status.history`.
 */
export type FluxOperatorReconciliation = {
  digest: string;
  firstReconciled: string;
  lastReconciled: string;
  lastReconciledDuration: string;
  lastReconciledStatus: string;
  metadata?: { [k: string]: string };
  totalReconciliations: number;
};

interface FluxOperatorObjectInterface extends FluxObjectInterface {
  status?: FluxObjectInterface['status'] & {
    history?: FluxOperatorReconciliation[];
  };
}

/**
 * Base class for the Flux Operator kinds (`fluxcd.controlplane.io`).
 */
export class FluxOperatorObject<
  T extends FluxOperatorObjectInterface = any,
> extends FluxObject<T> {
  isSuspended() {
    return (
      this.getAnnotations()?.[FLUX_OPERATOR_RECONCILE_ANNOTATION] === 'disabled'
    );
  }

  getSuspendedBy(): string | undefined {
    return this.getAnnotations()?.[SUSPENDED_BY_ANNOTATION];
  }

  protected getSuspendFieldPath(): string[] {
    return ['metadata', 'annotations', FLUX_OPERATOR_RECONCILE_ANNOTATION];
  }

  getSuspendFieldName(): string {
    return FLUX_OPERATOR_RECONCILE_ANNOTATION;
  }

  getSuspendPatch(suspend: boolean): Record<string, unknown> {
    return {
      metadata: {
        annotations: {
          [FLUX_OPERATOR_RECONCILE_ANNOTATION]: suspend
            ? 'disabled'
            : 'enabled',
        },
      },
    };
  }

  /**
   * The most recent reconciliation. The operator keeps `status.history`
   * ordered most recent first.
   */
  getLastReconciliation(): FluxOperatorReconciliation | undefined {
    return this.jsonData.status?.history?.[0];
  }
}
