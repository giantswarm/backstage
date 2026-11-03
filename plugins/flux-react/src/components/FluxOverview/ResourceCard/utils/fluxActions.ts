import {
  FluxObject,
  KubeObject,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Kinds that Flux can reconcile on demand and suspend — i.e. whose CRDs carry
 * both a suspend field and `status.lastHandledReconcileAt`, the two fields
 * these actions drive. The toolkit kinds suspend through `spec.suspend`, the
 * Flux Operator kinds through the `fluxcd.controlplane.io/reconcile`
 * annotation (see `FluxObject.getSuspendPatch`).
 *
 * This covers every kind the details panel renders except FluxReport, which
 * the operator regenerates on its own schedule. It is kept as an explicit
 * allowlist rather than inferred from `instanceof FluxObject`, so a future Flux
 * resource class that lacks the fields does not silently get buttons that
 * cannot work.
 *
 * `ImagePolicy` belongs here like the rest: `crds.fluxcd.v1.ImagePolicy` and
 * `v1beta2` both declare `spec.suspend` and `status.lastHandledReconcileAt`, and
 * the CLI covers it too (`flux reconcile|suspend|resume image policy`, see
 * `cmd/flux/reconcile_image_policy.go` and siblings in fluxcd/flux2). The reason
 * previously given here — that Flux supported neither operation for the kind —
 * was wrong.
 */
const ACTIONABLE_KINDS = [
  'Kustomization',
  'HelmRelease',
  'GitRepository',
  'OCIRepository',
  'HelmRepository',
  'ImagePolicy',
  'ImageRepository',
  'ImageUpdateAutomation',
  'FluxInstance',
  'ResourceSet',
  'ResourceSetInputProvider',
];

export function supportsFluxActions(
  resource: KubeObject,
): resource is FluxObject {
  return (
    resource instanceof FluxObject &&
    ACTIONABLE_KINDS.includes(resource.getKind())
  );
}
