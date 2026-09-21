import {
  App,
  BACKSTAGE_FIELD_MANAGER,
  HelmRelease,
  readProvenance,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * The tool that owns a deployment, or `undefined` when nothing does.
 *
 * A reconciler that owns the object re-creates it after a live delete, so the
 * portal withholds the action instead and names the tool. A deployment with no
 * markers at all was applied directly, which includes everything the portal's
 * own deploy flow creates.
 */
export function getDeploymentOwner(
  deployment: App | HelmRelease,
): string | undefined {
  const provenance = readProvenance(deployment);

  if (provenance.fluxKustomization) {
    return 'Flux';
  }
  if (provenance.helmRelease || provenance.fluxHelmRelease) {
    return 'Helm';
  }
  if (
    provenance.managedBy &&
    provenance.managedBy !== BACKSTAGE_FIELD_MANAGER
  ) {
    return provenance.managedBy;
  }

  return undefined;
}
