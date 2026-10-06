/**
 * Hive's tabs in the order the row shows them, by extension id. The page
 * sorts its attached sub-pages by this list rather than by attach order,
 * which depends on feature registration and on any deployment's
 * `app.extensions`. The first tab is where a bare `/hive` lands.
 */
export const HIVE_TAB_ORDER = [
  'sub-page:plans/hive-now',
  'sub-page:roadmap/hive',
  'sub-page:plans/hive-history',
  'sub-page:plans/hive-knowledge',
] as const;

/**
 * Hive's routes that are no tab: an epic's page and a plan without an epic
 * are reached from Now, the board and History, never from the tab row.
 */
export const HIVE_HIDDEN_ROUTES = [
  'sub-page:plans/hive-epics',
  'sub-page:plans/hive-plans',
] as const;

/** Whether a sub-page shows in the tab row. */
export function isHiveTab(id: string): boolean {
  return !(HIVE_HIDDEN_ROUTES as readonly string[]).includes(id);
}

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
