import { useMemo } from 'react';
import { identityApiRef, useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useQuery } from '@tanstack/react-query';

/** `group:default/team-shield` → `team-shield`; undefined for any other group. */
export function teamSlugOfGroupRef(ref: string): string | undefined {
  const match = ref.match(/^group:(?:[^/]+\/)?(team-[a-z0-9-]+)$/i);
  return match ? match[1].toLowerCase() : undefined;
}

/**
 * The GitHub teams the person is in, as `team-<name>` slugs: the catalog's
 * `team-*` groups, which Giant Swarm names as the GitHub teams are named.
 *
 * Membership is read twice, as on the Bot PRs page: the identity's
 * `ownershipEntityRefs` carry the groups only when the sign-in matched a
 * catalog user, and the catalog's `hasMember` relation answers otherwise.
 */
export function useMyTeams(): { teams: string[]; isLoading: boolean } {
  const identityApi = useApi(identityApiRef);
  const catalogApi = useApi(catalogApiRef);

  const identity = useQuery({
    queryKey: ['review-queue', 'identity'],
    queryFn: () => identityApi.getBackstageIdentity(),
    staleTime: Infinity,
  });

  const userRef = identity.data?.userEntityRef;
  const memberships = useQuery({
    queryKey: ['review-queue', 'team-memberships', userRef ?? ''],
    enabled: Boolean(userRef),
    queryFn: () =>
      catalogApi.getEntities({
        filter: {
          kind: 'Group',
          'spec.type': 'team',
          'relations.hasMember': userRef!,
        },
        fields: ['metadata.name'],
      }),
    staleTime: 5 * 60_000,
  });

  const ownKey = (identity.data?.ownershipEntityRefs ?? []).join(',');
  const memberKey = (memberships.data?.items ?? [])
    .map(item => item.metadata.name)
    .join(',');
  const isLoading =
    identity.isPending || (Boolean(userRef) && memberships.isPending);

  return useMemo(() => {
    const fromIdentity = (ownKey ? ownKey.split(',') : []).map(
      teamSlugOfGroupRef,
    );
    const fromCatalog = (memberKey ? memberKey.split(',') : []).map(name =>
      teamSlugOfGroupRef(`group:default/${name}`),
    );
    const teams = Array.from(
      new Set(
        [...fromIdentity, ...fromCatalog].filter((slug): slug is string =>
          Boolean(slug),
        ),
      ),
    ).sort();
    return { teams, isLoading };
  }, [ownKey, memberKey, isLoading]);
}
