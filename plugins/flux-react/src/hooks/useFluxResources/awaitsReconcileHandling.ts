import { FluxObject } from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * How long an unhandled reconcile request may hold the fast poll.
 *
 * Controllers pick a request up within seconds, so this only needs to be
 * generous enough to absorb clock skew between whoever wrote the annotation and
 * this browser. The bound matters because a request that will *never* be handled
 * — an object whose controller is not running, for instance — would otherwise
 * accelerate every list on the page indefinitely.
 */
export const PENDING_REQUEST_WINDOW = 2 * 60 * 1000;

/**
 * Whether a resource is waiting for a reconcile request to be picked up, in the
 * narrower sense that justifies polling faster.
 *
 * Deliberately stricter than `isReconcileRequestPending()`, which the UI uses to
 * disable the Reconcile button and is a plain "Flux still considers this
 * outstanding". Two cases never converge and must not accelerate the page:
 *
 * - **Suspended objects.** Flux reconcilers return early on `spec.suspend`
 *   without patching status, so `lastHandledReconcileAt` stays behind for as long
 *   as the object is suspended. Reachable by clicking Reconcile then Suspend.
 * - **Objects nothing reconciles**, e.g. a CRD installed without its controller,
 *   or an annotation applied out-of-band long ago. Bounded by
 *   {@link PENDING_REQUEST_WINDOW}; an unparseable annotation value never
 *   accelerates.
 *
 * Without this, one such object pins every list on the Flux page at the fast
 * interval for every user viewing that installation, until someone removes the
 * annotation by hand.
 */
export function awaitsReconcileHandling(resource: FluxObject): boolean {
  if (resource.isSuspended() || !resource.isReconcileRequestPending()) {
    return false;
  }

  const requestedAt = Date.parse(resource.getReconcileRequestedAt() ?? '');

  return (
    Number.isFinite(requestedAt) &&
    Math.abs(Date.now() - requestedAt) < PENDING_REQUEST_WINDOW
  );
}
