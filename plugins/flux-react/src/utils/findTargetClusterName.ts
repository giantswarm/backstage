import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export function findTargetClusterName(
  resource: Kustomization | HelmRelease,
): string | undefined {
  const kubeConfig = resource.getKubeConfig();
  const secretRefName = kubeConfig?.secretRef.name;
  return secretRefName
    ? secretRefName.replace(/-kubeconfig$/, '')
    : resource.cluster;
}
