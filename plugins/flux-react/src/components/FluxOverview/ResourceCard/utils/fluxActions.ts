import {
  FluxObject,
  KubeObject,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Kinds that Flux can reconcile on demand and suspend.
 *
 * `ImagePolicy` is absent on purpose: Flux has neither a reconcile request nor
 * a `spec.suspend` for it, so its cards get no action buttons.
 */
const ACTIONABLE_KINDS = [
  'Kustomization',
  'HelmRelease',
  'GitRepository',
  'OCIRepository',
  'HelmRepository',
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
