import { ToolSummary } from '../apis';

/**
 * Whether a tool answers a search: its full name, its short name (without the
 * prefix of the server offering it) or its description contains the query,
 * ignoring case. One rule for the servers list's tool matches and a server's
 * Tools filter, so the "3 of 42 match" a row shows is the list its Tools tab
 * opens with. The full name counts, so a name pasted from an agent's
 * transcript (`x_kubernetes_get_pods`) finds its tool; a search for a
 * server's own name does not turn into its tools all matching, because the
 * servers list treats a row its name matches as a name match.
 */
export function toolMatchesQuery(
  tool: ToolSummary,
  shortName: string,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [tool.name, shortName, tool.description ?? tool.summary].some(value =>
    value?.toLowerCase().includes(q),
  );
}
