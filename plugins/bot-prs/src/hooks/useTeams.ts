import { useMemo } from 'react';
import { identityApiRef, useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useQuery } from '@tanstack/react-query';

import { teamOfGroupRef } from '../lib/marge';

export type TeamsState = {
  /** Every team the catalogue knows, sorted; the person's own first. */
  teams: string[];
  /** The teams the person is a member of, from the identity's ownership refs. */
  ownTeams: string[];
  /** The team the page opens on: the person's first team, when they have one. */
  defaultTeam: string | undefined;
  isLoading: boolean;
};

/**
 * The teams the selector offers, and the one the page opens on.
 *
 * Both come from the catalogue, so a team here is a `Group` of type `team`
 * and the person's own teams are the groups their identity owns
 * (`ownershipEntityRefs`). Giant Swarm's groups are named `team-<name>`,
 * which is also how marge names its team files, so the prefix is dropped on
 * the way to the tool. Whether marge has a file for a team is marge's answer,
 * not the catalogue's: any name can be typed, and the queue says.
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

  const ownKey = (identity.data?.ownershipEntityRefs ?? []).join(',');
  const groupsKey = (groups.data?.items ?? [])
    .map(item => item.metadata.name)
    .join(',');

  return useMemo(() => {
    const ownTeams = Array.from(
      new Set(
        (ownKey ? ownKey.split(',') : [])
          .filter(ref => /^group:(?:[^/]+\/)?team-/.test(ref))
          .map(teamOfGroupRef)
          .filter((team): team is string => Boolean(team)),
      ),
    ).sort();
    // Only the `team-*` groups: those are the teams marge has team files
    // for. A portal whose groups carry no prefix (the lab's fixtures) lists
    // nothing here, and the free field is the way in.
    const catalogueTeams = (groupsKey ? groupsKey.split(',') : [])
      .filter(name => name.startsWith('team-'))
      .map(name => teamOfGroupRef(`group:default/${name}`))
      .filter((team): team is string => Boolean(team));
    const others = catalogueTeams
      .filter(team => !ownTeams.includes(team))
      .sort();
    return {
      teams: [...ownTeams, ...others],
      ownTeams,
      defaultTeam: ownTeams[0],
      isLoading: identity.isPending || groups.isPending,
    };
  }, [ownKey, groupsKey, identity.isPending, groups.isPending]);
}
