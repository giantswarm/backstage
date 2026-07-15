import {
  KubeObject,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  getKustomizationName,
  getKustomizationNamespace,
} from './isManagedByFlux';

function kustomizationKey(namespace: string, name: string) {
  return `${namespace}/${name}`;
}

/**
 * Walks the chain of Flux Kustomizations that (transitively) apply the given
 * resource, following the `kustomize.toolkit.fluxcd.io/name`/`namespace`
 * labels that Flux stamps on every object it applies.
 *
 * Returns the ancestors ordered nearest parent first, root last. The walk
 * stops at the first ancestor that is not present in the given list, and is
 * guarded against self-references (e.g. flux-system applying itself) and
 * cycles.
 */
export function findKustomizationAncestors(
  resource: KubeObject,
  kustomizations: Kustomization[],
): Kustomization[] {
  const kustomizationsByKey = new Map(
    kustomizations.map(kustomization => [
      kustomizationKey(
        kustomization.getNamespace() ?? '',
        kustomization.getName(),
      ),
      kustomization,
    ]),
  );

  const ancestors: Kustomization[] = [];
  const visited = new Set<string>();

  let current: KubeObject = resource;
  for (;;) {
    const name = getKustomizationName(current);
    const namespace = getKustomizationNamespace(current);
    if (!name || !namespace) {
      break;
    }

    const key = kustomizationKey(namespace, name);
    if (visited.has(key)) {
      break;
    }
    visited.add(key);

    const parent = kustomizationsByKey.get(key);
    if (!parent) {
      break;
    }

    ancestors.push(parent);
    current = parent;
  }

  return ancestors;
}

export type BlockedAncestor = {
  kustomization: Kustomization;
  reason: 'not-ready' | 'suspended';
  message?: string;
};

/**
 * Returns the ancestor Kustomizations of the given resource that are blocking
 * reconciliation, either because they are suspended or because their Ready
 * condition is False. Ordered nearest parent first, root last — the last
 * entry is the topmost blocked ancestor and usually the root cause.
 */
export function findBlockedAncestors(
  resource: KubeObject,
  kustomizations: Kustomization[],
): BlockedAncestor[] {
  return findKustomizationAncestors(resource, kustomizations).flatMap(
    (kustomization): BlockedAncestor[] => {
      if (kustomization.isSuspended()) {
        return [{ kustomization, reason: 'suspended' }];
      }

      const readyCondition = kustomization.findReadyCondition();
      if (readyCondition?.status === 'False') {
        return [
          {
            kustomization,
            reason: 'not-ready',
            message: readyCondition.message,
          },
        ];
      }

      return [];
    },
  );
}
