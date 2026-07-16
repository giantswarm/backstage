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
  /** Position in the full ancestor chain (0 = nearest parent). */
  chainIndex: number;
};

/**
 * Returns the ancestor Kustomizations of the given resource that are blocking
 * reconciliation, either because they are suspended or because their Ready
 * condition is False. Ordered nearest parent first, root last.
 */
export function findBlockedAncestors(
  resource: KubeObject,
  kustomizations: Kustomization[],
): BlockedAncestor[] {
  return findKustomizationAncestors(resource, kustomizations).flatMap(
    (kustomization, chainIndex): BlockedAncestor[] => {
      if (kustomization.isSuspended()) {
        return [{ kustomization, reason: 'suspended', chainIndex }];
      }

      const readyCondition = kustomization.findReadyCondition();
      if (readyCondition?.status === 'False') {
        return [
          {
            kustomization,
            reason: 'not-ready',
            message: readyCondition.message,
            chainIndex,
          },
        ];
      }

      return [];
    },
  );
}

/**
 * Picks the blocked ancestor to present as the root cause: the topmost entry
 * of the contiguous run of blocked ancestors that starts at the one nearest
 * to the resource. In a failure cascade the whole chain is blocked and this
 * yields the topmost ancestor, which is the actual root cause. When a healthy
 * Kustomization sits between two blocked ones, the failure above it does not
 * propagate down to the resource, so the nearer run wins.
 */
export function selectBlockingRootCause(
  blockedAncestors: BlockedAncestor[],
): BlockedAncestor | undefined {
  let rootCause = blockedAncestors[0];
  for (const candidate of blockedAncestors.slice(1)) {
    if (candidate.chainIndex !== rootCause.chainIndex + 1) {
      break;
    }
    rootCause = candidate;
  }

  return rootCause;
}
