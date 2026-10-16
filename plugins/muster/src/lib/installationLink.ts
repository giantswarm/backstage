/**
 * `path` with the installation that names the page's resource as
 * `?installation=<inst>`, then any further query parameters: a workflow's,
 * connector's or tool's page reads its resource by name on that installation.
 * The one builder for these links, so every one encodes the same way
 * (`URLSearchParams`). Empty further values are left out. Without an
 * installation there is no link (undefined), never one the active
 * installation would silently scope.
 */
export function withInstallationQuery(
  path: string,
  installation: string,
  query: Record<string, string | undefined> = {},
): string | undefined {
  if (!installation) {
    return undefined;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ installation, ...query })) {
    if (value) {
      params.set(key, value);
    }
  }
  return `${path}?${params.toString()}`;
}
