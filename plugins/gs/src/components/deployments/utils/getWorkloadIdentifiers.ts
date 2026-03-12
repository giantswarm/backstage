import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Derives the namespace where the workload pods actually run.
 * - For HelmRelease CRs: `spec.targetNamespace` (falls back to the CR namespace).
 * - For App CRs: `spec.namespace` is the target deployment namespace.
 */
export function getWorkloadNamespace(deployment: App | HelmRelease): string {
  if (deployment instanceof HelmRelease) {
    return deployment.getTargetNamespace() ?? deployment.getNamespace() ?? '';
  }
  return deployment.getSpec()?.namespace ?? deployment.getNamespace() ?? '';
}

/**
 * Derives the pod name prefix for the workload.
 * - For HelmRelease CRs: `spec.releaseName` (falls back to the CR name).
 * - For App CRs: `spec.name` (the Helm release name, falls back to the CR name).
 */
export function getWorkloadPodPrefix(deployment: App | HelmRelease): string {
  if (deployment instanceof HelmRelease) {
    return deployment.getReleaseName() ?? deployment.getName();
  }
  return deployment.getSpec()?.name ?? deployment.getName();
}
