/**
 * `path` with the installation that names the page's resource as
 * `?installation=<inst>`, then any further query parameters: a workflow's,
 * connector's or tool's page reads its resource by name on that installation.
 * The one builder for these links, so every one encodes the same way
 * (`URLSearchParams`). Empty values are left out.
 */
export function withInstallationQuery(
  path: string,
  installation: string,
  query: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ installation, ...query })) {
    if (value) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}
