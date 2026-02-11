import {
  GitRepository,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export function findKustomizationSource(
  kustomization: Kustomization,
  allGitRepositories: GitRepository[],
  allOCIRepositories: OCIRepository[],
): GitRepository | OCIRepository | undefined {
  const sourceRef = kustomization.getSourceRef();
  if (!sourceRef) {
    return undefined;
  }

  const name = sourceRef.name;
  const namespace = sourceRef.namespace ?? kustomization.getNamespace();

  if (sourceRef.kind === GitRepository.kind) {
    return allGitRepositories.find(
      r => r.getName() === name && r.getNamespace() === namespace,
    );
  }

  if (sourceRef.kind === OCIRepository.kind) {
    return allOCIRepositories.find(
      r => r.getName() === name && r.getNamespace() === namespace,
    );
  }

  return undefined;
}
