import type { QueryClient } from '@tanstack/react-query';
import type { CustomResourceMatcher } from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Drops the cached `list` and `get` reads of the given kinds on one
 * installation, so the next render re-reads them — what every write here does
 * afterwards instead of editing the cache (it is persisted to localStorage,
 * and a stale object could be rehydrated on reload). Keyed exactly like the
 * kubernetes-react read hooks (`['cluster', <installation>, <op>, <group>,
 * <version>, <plural>, …]`, empty group dropped).
 */
export async function invalidateResourceReads(
  queryClient: QueryClient,
  installation: string,
  gvks: CustomResourceMatcher[],
): Promise<void> {
  await Promise.all(
    gvks.flatMap(gvk =>
      ['list', 'get'].map(operation =>
        queryClient.invalidateQueries({
          queryKey: [
            'cluster',
            installation,
            operation,
            gvk.group,
            gvk.apiVersion,
            gvk.plural,
          ].filter(Boolean),
        }),
      ),
    ),
  );
}

/**
 * Spelled out rather than `Secret.getGVK()`: the Secret class sets no `group`
 * static (core resources have none), so its GVK would carry `group: undefined`
 * — fine for path building, but a mismatch for the string-keyed query keys.
 */
export const SECRET_GVK: CustomResourceMatcher = {
  group: '',
  apiVersion: 'v1',
  plural: 'secrets',
  isCore: true,
};
