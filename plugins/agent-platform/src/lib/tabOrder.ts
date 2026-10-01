/**
 * The Agent Platform page's level-1 tabs, in the order the row shows them,
 * by extension id. The page sorts its attached sub-pages by this list rather
 * than by attach order, which depends on feature registration and on any
 * deployment's `app.extensions` (an extension named there attaches first).
 */
export const AGENT_PLATFORM_TAB_ORDER = [
  'sub-page:agent-platform/sessions',
  'sub-page:agent-platform/agents',
  'sub-page:agent-platform/models',
  'sub-page:muster/mcp-servers',
  'sub-page:muster/workflows',
  'sub-page:agent-platform/usage',
] as const;

/**
 * Where a tab with this extension id goes. A tab the list does not know (a
 * future one, another plugin's) sorts before Usage, which closes the row.
 */
function tabRank(id: string): number {
  const index = (AGENT_PLATFORM_TAB_ORDER as readonly string[]).indexOf(id);
  return index === -1 ? AGENT_PLATFORM_TAB_ORDER.length - 1.5 : index;
}

/**
 * The page's tabs in row order. Stable: tabs of the same rank keep the order
 * they attached in.
 */
export function orderTabs<T>(
  tabs: readonly T[],
  idOf: (tab: T) => string,
): T[] {
  return [...tabs].sort((a, b) => tabRank(idOf(a)) - tabRank(idOf(b)));
}
