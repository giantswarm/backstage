import { useMemo } from 'react';
import { identityApiRef, useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useQuery } from '@tanstack/react-query';

import { teamOfGroupRef } from '../lib/marge';

export type TeamsState = {
  /** Every team the catalog knows, sorted; the person's own first. */
  teams: string[];
  /** The teams the person is a member of. */
  ownTeams: string[];
  /** The team the page opens on: the person's first team, when they have one. */
  defaultTeam: string | undefined;
  isLoading: boolean;
};

const namesOf = (items: { metadata: { name: string } }[] | undefined) =>
  (items ?? []).map(item => item.metadata.name).join(',');

const teamsOfNames = (key: string) =>
  (key ? key.split(',') : [])
    .filter(name => name.startsWith('team-'))
    .map(name => teamOfGroupRef(`group:default/${name}`))
    .filter((team): team is string => Boolean(team));

/**
 * The teams the selector offers, and the one the page opens on.
 *
 * A team is a `Group` of type `team` in the catalog. Giant Swarm names those
 * groups `team-<name>`, which is also how marge names its team files, so the
 * prefix is dropped on the way to the tool. Whether marge has a file for a
 * team is marge's answer, not the catalog's: any name can be typed, and the
 * queue says.
 *
 * Membership is read twice, because the two sources disagree in practice: the
 * identity's `ownershipEntityRefs` carry the groups only when the sign-in
 * resolver matched a catalog user, and a token issued off the email alone
 * carries none. The catalog's own `hasMember` relation answers for that case.
 */
export function useTeams(): TeamsState {
  const identityApi = useApi(identityApiRef);
  const catalogApi = useApi(catalogApiRef);

  const identity = useQuery({
    queryKey: ['bot-prs', 'identity'],
    queryFn: () => identityApi.getBackstageIdentity(),
    staleTime: Infinity,
  });

  const groups = useQuery({
    queryKey: ['bot-prs', 'team-groups'],
    queryFn: () =>
      catalogApi.getEntities({
        filter: { kind: 'Group', 'spec.type': 'team' },
        fields: ['metadata.name'],
      }),
    staleTime: 5 * 60_000,
  });

  const userRef = identity.data?.userEntityRef;
  const memberships = useQuery({
    queryKey: ['bot-prs', 'team-memberships', userRef ?? ''],
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
  const memberKey = namesOf(memberships.data?.items);
  const groupsKey = namesOf(groups.data?.items);
  const isPending =
    identity.isPending ||
    groups.isPending ||
    (Boolean(userRef) && memberships.isPending);

  return useMemo(() => {
    const ownTeams = Array.from(
      new Set([
        ...(ownKey ? ownKey.split(',') : [])
          .filter(ref => /^group:(?:[^/]+\/)?team-/.test(ref))
          .map(teamOfGroupRef)
          .filter((team): team is string => Boolean(team)),
        ...teamsOfNames(memberKey),
      ]),
    ).sort();
    // Only the `team-*` groups: those are the teams marge has team files for.
    const others = teamsOfNames(groupsKey)
      .filter(team => !ownTeams.includes(team))
      .sort();
    return {
      teams: [...ownTeams, ...others],
      ownTeams,
      defaultTeam: ownTeams[0],
      isLoading: isPending,
    };
  }, [ownKey, memberKey, groupsKey, isPending]);
}
