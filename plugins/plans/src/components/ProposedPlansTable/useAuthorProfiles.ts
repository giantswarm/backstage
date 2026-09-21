import { useMemo } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useQuery } from '@tanstack/react-query';

/**
 * The catalog entity ref for a GitHub login.
 *
 * Lower-cased, because the catalog indexes entity refs in lower case: a
 * mixed-case login like `QuentinBisson` matches nothing when asked for
 * verbatim, and the person silently renders as their bare login with no photo.
 * GitHub logins are case-insensitive, and the entity page resolves either way.
 */
export function userEntityRef(login: string): string {
  return `user:default/${login.toLowerCase()}`;
}

/**
 * The fallback, hoisted: a fresh `new Map()` per render would give every render
 * a new identity and defeat the `columnConfig` memo that consumes it.
 */
const NO_PROFILES: ReadonlyMap<string, AuthorProfile> = new Map();

/** What the Author column needs about a person, beyond their login. */
export interface AuthorProfile {
  displayName?: string;
  picture?: string;
}

/**
 * Profile pictures for the pull request authors, by GitHub login.
 *
 * `EntityRefLink` resolves a person's display name on its own, through
 * `entityPresentationApiRef` -- but not their photo: the presentation API
 * fetches a fixed field list (`kind`, `metadata.*`, `spec.profile.displayName`,
 * `spec.type`) that `spec.profile.picture` is not part of, and the list is not
 * configurable. So the picture is read here instead, in one batched request for
 * the distinct authors of the whole table rather than one per row.
 */
export function useAuthorProfiles(
  logins: readonly (string | undefined)[],
): ReadonlyMap<string, AuthorProfile> {
  const catalogApi = useApi(catalogApiRef);

  // Sorted and de-duplicated so the query key is stable across re-renders and
  // across a reordering of the rows.
  const refs = useMemo(
    () =>
      // De-duplicated on the lower-cased login, the same form the ref takes:
      // `marians` and `Marians` on two pull requests are one person, and would
      // otherwise be asked for twice in the same batch.
      [
        ...new Set(
          logins
            .filter((login): login is string => Boolean(login))
            .map(login => login.toLowerCase()),
        ),
      ]
        .sort()
        .map(userEntityRef),
    [logins],
  );

  const { data } = useQuery({
    queryKey: ['plans', 'author-profiles', refs],
    enabled: refs.length > 0,
    // The catalog is the same for everyone and changes rarely; re-reading it
    // on every visit to the page would be wasted requests.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { items } = await catalogApi.getEntitiesByRefs({
        entityRefs: refs,
        fields: [
          'kind',
          'metadata.name',
          'spec.profile.displayName',
          'spec.profile.picture',
        ],
      });
      const byLogin = new Map<string, AuthorProfile>();
      for (const item of items) {
        if (!item) {
          // A login with no catalog User -- an outside contributor, or a bot.
          continue;
        }
        const profile = (item.spec as { profile?: AuthorProfile } | undefined)
          ?.profile;
        // Keyed as the caller will ask for it -- by the lower-cased login,
        // since `metadata.name` keeps the GitHub login's original case.
        byLogin.set(item.metadata.name.toLowerCase(), {
          displayName: profile?.displayName,
          picture: profile?.picture,
        });
      }
      return byLogin;
    },
  });

  return data ?? NO_PROFILES;
}
