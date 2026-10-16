/**
 * `path` with the query parameters, encoded the one way every link here uses
 * (`URLSearchParams`). Empty values are left out, and so is the `?` when
 * nothing is left.
 */
export function withQuery(
  path: string,
  query: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * `path` — a list: the connectors, Usage — scoped to one installation as
 * `?installation=<inst>`, then any further query parameters. The parameter
 * only ever sets a section's scope: a connector's, tool's or workflow's own
 * installation is part of its path (`useServerPageLinks`,
 * `useWorkflowPageLinks`). Without an installation there is no link
 * (undefined), never one the active installation would silently scope.
 */
export function withInstallationQuery(
  path: string,
  installation: string,
  query: Record<string, string | undefined> = {},
): string | undefined {
  if (!installation) {
    return undefined;
  }
  return withQuery(path, { installation, ...query });
}
