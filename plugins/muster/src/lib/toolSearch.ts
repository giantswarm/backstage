import { ToolSummary } from '../apis';

/**
 * Whether a tool answers a search: its short name (without the prefix of the
 * server offering it) or its description contains the query, ignoring case.
 * Not the full name: every tool of `github` is `x_github_…`, so searching for
 * a server's name would otherwise count all its tools as matches. One rule
 * for the servers list's tool matches and a server's Tools filter, so the
 * "3 of 42 match" a row shows is the list its Tools tab opens with.
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
  return [shortName, tool.description ?? tool.summary].some(value =>
    value?.toLowerCase().includes(q),
  );
}
