import type { SourceDraft } from '../../lib/workspaceDraft';
import {
  exclusionsOutsidePicks,
  hasFilters,
  uniqueNames,
} from '../../lib/workspaceSelection';
import { repositoryNoun } from './repositoryNoun';

/**
 * How many repositories a source selects: known (from the draft alone, or
 * as the manager resolved it), still being counted by the manager, not known
 * because the manager could not say or cannot be asked, or nothing yet (no
 * pick and no filter). `excluded` is how many selected repositories the
 * exclusions leave out, not how many exclusions there are.
 */
export type SourceCount =
  | { state: 'known'; total: number; excluded: number }
  | { state: 'counting' }
  | { state: 'unknown' }
  | { state: 'none' };

/**
 * The filter's part of the count line: its matches, `null` while the listing
 * counts them, `'uncounted'` where the listing cannot count what the filter
 * takes (topics that must all match: the listing's topic filter is "any
 * of"), absent without filters.
 */
export type FilterMatches = number | null | 'uncounted' | undefined;

/**
 * The picker's count line: `2 by filter · 3 by name · 1 excluded = 4
 * repositories`. When the parts do not add up to the manager's total (a pick
 * by name that a filter matches too counts once), or the filter's part is
 * not counted, the total stands on its own: `… · 4 repositories in all`.
 * Never a number the form cannot know.
 */
export function countSummary({
  byFilter,
  byName,
  count,
  providerKind,
}: {
  byFilter?: FilterMatches;
  byName: number;
  count: SourceCount;
  providerKind: string | undefined;
}): string {
  if (count.state === 'none') {
    return 'Nothing picked by name or filter yet';
  }
  const parts = [
    typeof byFilter === 'number' ? `${byFilter} by filter` : undefined,
    byFilter === null ? '… by filter' : undefined,
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
        (byFilter === undefined || typeof byFilter === 'number') &&
        (byFilter ?? 0) + byName - count.excluded === count.total;
      return adds ? `${parts} = ${total}` : `${parts} · ${total} in all`;
    }
  }
}

/**
 * What the exclusions do now: how many selected repositories they leave
 * out, and how many match nothing the source selects, each name once.
 * `excluded` is undefined while the manager counts a source with filters.
 */
export function exclusionEffect(
  source: SourceDraft,
  excluded: number | undefined,
  providerKind: string | undefined,
): string | undefined {
  const count = uniqueNames(source.exclude).length;
  if (count === 0 || excluded === undefined) {
    return undefined;
  }
  // An exclusion is one repository's name: it leaves out one at most.
  const idle = Math.max(0, count - excluded);
  const leftOut = `${excluded} ${repositoryNoun(providerKind, excluded)} left out`;
  if (idle === 0) {
    return `${leftOut}.`;
  }
  if (excluded === 0) {
    return `Nothing is left out: ${
      count === 1 ? 'the exclusion matches' : `the ${count} exclusions match`
    } nothing the source selects.`;
  }
  const nothing =
    idle === 1
      ? '1 exclusion matches nothing the source selects'
      : `${idle} exclusions match nothing the source selects`;
  // Without filters the form knows which ones: they name no pick.
  const outside = hasFilters(source) ? [] : exclusionsOutsidePicks(source);
  const names = outside.length === idle ? `: ${outside.join(', ')}` : '';
  return `${leftOut}; ${nothing}${names}.`;
}

/**
 * A source's count from a preview of it (`useWorkspacePreview`): known once
 * it resolved the sources as they are now, counting until then, not known
 * when it failed or cannot run (no client, nothing complete to preview).
 */
export function previewCount(
  preview: {
    data?: { total: number; excluded: number };
    error: unknown;
    hasSources: boolean;
    isSelectionCurrent: boolean;
  },
  canRead: boolean,
): SourceCount {
  if (!canRead || !preview.hasSources) {
    return { state: 'unknown' };
  }
  if (preview.data && preview.isSelectionCurrent) {
    return {
      state: 'known',
      total: preview.data.total,
      excluded: preview.data.excluded,
    };
  }
  return preview.error ? { state: 'unknown' } : { state: 'counting' };
}
