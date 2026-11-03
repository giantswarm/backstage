import { Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * The installations that host clusters of each infrastructure kind
 * (`AWSCluster`, `VSphereCluster`, ...), so a kind-specific resource is only
 * listed where it can exist.
 */
export function installationsByInfraKind(
  clusters: Cluster[],
): Record<string, string[]> {
  const byKind = new Map<string, Set<string>>();
  for (const cluster of clusters) {
    const kind = cluster.getInfrastructureRef()?.kind;
    if (!kind) {
      continue;
    }
    if (!byKind.has(kind)) {
      byKind.set(kind, new Set());
    }
    byKind.get(kind)!.add(cluster.cluster);
  }

  return Object.fromEntries(
    Array.from(byKind, ([kind, installations]) => [
      kind,
      Array.from(installations),
    ]),
  );
}
