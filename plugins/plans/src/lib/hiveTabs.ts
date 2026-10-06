/**
 * Hive's secondary tabs in the order the row shows them after the front
 * page, by extension id. The page sorts its attached sub-pages by this list
 * rather than by attach order, which depends on feature registration and on
 * any deployment's `app.extensions`.
 */
export const HIVE_TAB_ORDER = [
  'sub-page:roadmap/hive',
  'sub-page:plans/hive-knowledge',
] as const;

/** Where a tab goes; one the list does not know goes last. */
function tabRank(id: string): number {
  const index = (HIVE_TAB_ORDER as readonly string[]).indexOf(id);
  return index === -1 ? HIVE_TAB_ORDER.length : index;
}

/** The tabs in row order. Stable: unknown tabs keep their attach order. */
export function orderHiveTabs<T>(
  tabs: readonly T[],
  idOf: (tab: T) => string,
): T[] {
  return [...tabs].sort((a, b) => tabRank(idOf(a)) - tabRank(idOf(b)));
}
