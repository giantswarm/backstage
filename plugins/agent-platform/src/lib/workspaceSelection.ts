/**
 * What a workspace source selects, as workspace-manager resolves it
 * (`provider.Select` in giantswarm/workspace-manager): a repository is in
 * when it is picked by name or matches every filter set, and an exclusion
 * drops it whatever selects it, a pick by name included. Names compare
 * without case, and an exclusion is a repository's exact name, never a
 * pattern. The manager accepts an exclusion of a name it cannot find: it
 * leaves nothing out until a repository of that name is selected.
 */

/** The parts of a source the selection reads; a draft's or a stored one's. */
export type SelectionSource = {
  owner: string;
  repositories?: string[];
  languages?: string[];
  topics?: string[];
  filters?: { languages?: string[]; topics?: { names: string[] } };
  exclude?: string[];
};

/** Whether two repository names are the same one, as the manager compares. */
export function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Whether `name` is in `names`, without case. */
export function includesName(names: string[] | undefined, name: string) {
  return (names ?? []).some(n => sameName(n, name));
}

/** Whether the source selects by language or topic: the manager resolves those. */
export function hasFilters(source: SelectionSource): boolean {
  return (
    (source.languages?.length ?? 0) > 0 ||
    (source.topics?.length ?? 0) > 0 ||
    (source.filters?.languages?.length ?? 0) > 0 ||
    (source.filters?.topics?.names.length ?? 0) > 0
  );
}

/**
 * The names once each, compared without case, as the manager's sets take
 * them: `['portal', 'Portal']` is one repository. The first spelling stays.
 */
export function uniqueNames(names: string[] | undefined): string[] {
  const seen = new Set<string>();
  return (names ?? []).filter(name => {
    const key = name.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** The picks by name no exclusion drops, each once. */
export function keptPicks(source: SelectionSource): string[] {
  return uniqueNames(source.repositories).filter(
    name => !includesName(source.exclude, name),
  );
}

/**
 * The exclusions that leave out none of the picks by name, each once.
 * Without filters they leave nothing out at all; with filters, one may drop
 * a match.
 */
export function exclusionsOutsidePicks(source: SelectionSource): string[] {
  return uniqueNames(source.exclude).filter(
    name => !includesName(source.repositories, name),
  );
}

/**
 * How many repositories a source selects, where the form can tell without
 * the manager: a source with picks by name and no filters selects those
 * picks less the excluded ones (`excluded`), each name once. With filters
 * only the manager knows which matches an exclusion drops, and a source with
 * no selector at all is the manager's to read too: `undefined`.
 */
export function localSourceCount(
  source: SelectionSource,
): { total: number; excluded: number } | undefined {
  const picks = uniqueNames(source.repositories).length;
  if (hasFilters(source) || picks === 0) {
    return undefined;
  }
  const total = keptPicks(source).length;
  return { total, excluded: picks - total };
}
