import {
  FluxObject,
  KubeObject,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Kinds that Flux can reconcile on demand and suspend — i.e. whose CRDs carry
 * both `spec.suspend` and `status.lastHandledReconcileAt`, the two fields these
 * actions drive.
 *
 * This covers every kind the details panel renders. It is kept as an explicit
 * allowlist rather than inferred from `instanceof FluxObject`, so a future Flux
 * resource class that lacks the fields does not silently get buttons that
 * cannot work.
 *
 * Note this is deliberately *not* the same set as the `flux` CLI's reconcile
 * subcommands: there is no `flux reconcile image policy`, but
 * image-reflector-controller does honour the annotation and `spec.suspend` for
 * ImagePolicy, so the UI can offer both.
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
];

export function supportsFluxActions(
  resource: KubeObject,
): resource is FluxObject {
  return (
    resource instanceof FluxObject &&
    ACTIONABLE_KINDS.includes(resource.getKind())
  );
}
