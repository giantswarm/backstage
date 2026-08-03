/**
 * Flux provenance helpers.
 *
 * The implementation lives in `kubernetes-react` alongside `KubeObject`, next to
 * the broader Helm/Flux provenance helpers (`isGitOpsManaged`, `readProvenance`)
 * it used to be duplicated by. Re-exported here so the flux-react public API —
 * and its consumers in `gs` — stay unchanged.
 */
export {
  getKustomizationName,
  getKustomizationNamespace,
  isManagedByFlux,
} from '@giantswarm/backstage-plugin-kubernetes-react';
