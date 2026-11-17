/**
 * Where a pool, a cache claim or a node runs, as one line under its name
 * when a narrow table leaves out its Cluster and Environment columns: the
 * cluster, its organization (two clusters of one name stay apart) and the
 * environment, "wc1 · acme · inst-1".
 */
export function describeWhereItRuns(
  row: {
    installation: string;
    cluster: { name: string; organization?: string };
  },
  showInstallation: boolean,
): string {
  return [
    row.cluster.name,
    row.cluster.organization,
    showInstallation ? row.installation : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}
