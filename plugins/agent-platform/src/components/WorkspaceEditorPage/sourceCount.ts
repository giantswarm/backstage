import { repositoryNoun } from './repositoryNoun';

/**
 * How many repositories a source selects: known (from the draft alone, or
 * as the manager resolved it), still being counted by the manager, or not
 * known because the manager could not say. `excluded` is how many selected
 * repositories the exclusions leave out, not how many exclusions there are.
 */
export type SourceCount =
  | { state: 'known'; total: number; excluded: number }
  | { state: 'counting' }
  | { state: 'unknown' };

/**
 * The picker's count line: `2 by filter · 3 by name · 1 excluded = 4
 * repositories`. When the parts do not add up to the manager's total (a pick
 * by name that a filter matches too counts once), the total stands on its
 * own: `… · 4 repositories in all`. Never a number the form cannot know.
 */
export function countSummary({
  byFilter,
  byName,
  count,
  providerKind,
}: {
  /** The filter's matches, `null` while counting; absent without filters. */
  byFilter?: number | null;
  byName: number;
  count: SourceCount;
  providerKind: string | undefined;
}): string {
  const parts = [
    byFilter === undefined ? undefined : `${byFilter ?? '…'} by filter`,
    `${byName} by name`,
    count.state === 'known' && count.excluded > 0
      ? `${count.excluded} excluded`
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  switch (count.state) {
    case 'counting':
      return `${parts} · counting…`;
    case 'unknown':
      return `${parts} · total not known`;
    default: {
      const total = `${count.total} ${repositoryNoun(providerKind, count.total)}`;
      const adds =
        (byFilter ?? 0) + byName - count.excluded === count.total &&
        byFilter !== null;
      return adds ? `${parts} = ${total}` : `${parts} · ${total} in all`;
    }
  }
}
