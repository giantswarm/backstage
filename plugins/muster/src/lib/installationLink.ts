/**
 * `path` with the installation that names the page's resource, as
 * `?installation=<inst>`: a workflow's, connector's or tool's page reads its
 * resource by name on that installation. An empty installation adds nothing.
 */
export function withInstallationQuery(
  path: string,
  installation: string,
): string {
  return installation
    ? `${path}?installation=${encodeURIComponent(installation)}`
    : path;
}
