import {
  enforceMatchers,
  QueryRefusedError,
} from '@giantswarm/backstage-plugin-gs-common';
import { clusterMetricsSelector } from './promql';
import { buildQuery as karpenterNodePoolQuery } from './useKarpenterNodePoolStatus';
import { httpRouteHostnameQueries } from './useMimirHttpRouteHostnames';
import { buildNodePoolCapacityQuery } from './useMimirNodePoolCapacity';
import { buildNodePoolNodesQuery } from './useMimirNodePoolNodes';
import { resourceUsageQueries } from './useMimirResourceUsage';
import { workloadDiagnosticsQueries } from './useMimirWorkloadDiagnostics';
import { buildWorkloadQuery } from './useMimirWorkloads';
import { buildOrQuery } from './useMimirWorkloadStatus';

/**
 * The cluster and deployment queries as `MimirService` rewrites them for an
 * installation with `mimir.matchers`: here a platform on the workload cluster
 * `gerbil`, its series in a management cluster's Mimir.
 */
const MATCHERS = { cluster_id: 'gerbil', cluster_type: 'workload_cluster' };
const ENFORCED = 'cluster_id="gerbil",cluster_type="workload_cluster"';

/** The queries of the cluster and deployment pages for one cluster. */
function queriesFor(cluster: string): Record<string, string> {
  return {
    ...resourceUsageQueries(cluster, 'default', 'api'),
    ...workloadDiagnosticsQueries(cluster, 'default', 'api'),
    ...httpRouteHostnameQueries(cluster, 'default'),
    workloadStatusDesired: buildOrQuery(
      `cluster_id="${cluster}",namespace="default"`,
      'api',
      'desiredMetric',
    ),
    workloadStatusReady: buildOrQuery(
      `cluster_id="${cluster}",namespace="default"`,
      'api',
      'readyMetric',
    ),
    nodePoolNodes: buildNodePoolNodesQuery(cluster, 'pool0'),
    karpenterNodePool: karpenterNodePoolQuery(cluster, 'pool0'),
    gatewayMetrics: clusterMetricsSelector(['a_info', 'b_info'], cluster),
  };
}

/** The queries that select several clusters at once, by regex. */
function multiClusterQueries(clusters: string[]): Record<string, string> {
  return {
    workloads: buildWorkloadQuery('kube_deployment_labels', clusters),
    nodePoolCapacity: buildNodePoolCapacityQuery(clusters),
  };
}

/** How many selectors carry every enforced matcher. */
function enforcedSelectors(query: string): number {
  return query.split(ENFORCED).length - 1;
}

describe('the cluster and deployment queries with enforced matchers', () => {
  describe('for the installation’s own cluster', () => {
    it.each(Object.entries(queriesFor('gerbil')))(
      '%s: adds the matchers, keeping its own',
      (_, query) => {
        const rewritten = enforceMatchers(query, MATCHERS);

        // Its `cluster_id="gerbil"` is already the enforced value, so only
        // `cluster_type` is added: the selector keeps reading one cluster.
        expect(rewritten).toContain('cluster_type="workload_cluster"');
        expect(rewritten).not.toContain('cluster_id="gerbil",cluster_id=');
      },
    );
  });

  describe('for a cluster that is not the installation’s', () => {
    it.each(Object.entries(queriesFor('golem')))(
      '%s: is refused, not sent',
      (_, query) => {
        // As outside the matchers: the page shows its no-data state.
        expect(() => enforceMatchers(query, MATCHERS)).toThrow(
          expect.objectContaining({
            name: QueryRefusedError.name,
            outsideMatchers: true,
          }),
        );
      },
    );
  });

  describe('across clusters', () => {
    it.each(Object.entries(multiClusterQueries(['golem', 'gerbil'])))(
      '%s: narrows the regex to the installation’s cluster',
      (_, query) => {
        const rewritten = enforceMatchers(query, MATCHERS);

        expect(rewritten).toContain('cluster_id=~"golem|gerbil"');
        expect(enforcedSelectors(rewritten)).toBeGreaterThan(0);
      },
    );

    it.each(Object.entries(multiClusterQueries(['golem', 'glean'])))(
      '%s: is refused when none of the clusters is the installation’s',
      (_, query) => {
        // As outside the matchers: the page shows its no-data state.
        expect(() => enforceMatchers(query, MATCHERS)).toThrow(
          expect.objectContaining({
            name: QueryRefusedError.name,
            outsideMatchers: true,
          }),
        );
      },
    );
  });

  it('puts the matchers on every selector of a query of several', () => {
    const rewritten = enforceMatchers(
      buildNodePoolCapacityQuery(['gerbil']),
      MATCHERS,
    );

    // Five selectors: node labels and the Ready condition, twice (the ready
    // pool nodes are used for the capacity and the node count), and the
    // capacity.
    expect(enforcedSelectors(rewritten)).toBe(5);
  });

  it('sends every query as it is without matchers', () => {
    for (const query of [
      ...Object.values(queriesFor('golem')),
      ...Object.values(multiClusterQueries(['golem', 'glean'])),
    ]) {
      expect(enforceMatchers(query, {})).toBe(query);
    }
  });
});
