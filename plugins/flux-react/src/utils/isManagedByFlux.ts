/**
 * Flux provenance helpers.
 *
 * Implemented in `kubernetes-react`, alongside `KubeObject` and the broader
 * Helm/Flux provenance helpers (`isGitOpsManaged`, `readProvenance`) that read the
 * same labels. Re-exported here as part of the flux-react public API.
 */
export {
  getKustomizationName,
  getKustomizationNamespace,
  isManagedByFlux,
} from '@giantswarm/backstage-plugin-kubernetes-react';
