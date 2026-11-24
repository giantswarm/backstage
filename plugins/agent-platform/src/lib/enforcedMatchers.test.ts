import {
  enforceMatchers,
  QueryRefusedError,
} from '@giantswarm/backstage-plugin-gs-common';
import { egressRefusalsQuery } from './egressRefusals';
import {
  byPersonQueriesFor,
  llmUsageQueriesFor,
  llmUsageRangeQueriesFor,
  organizationsSeenQueryFor,
  todayPartialQueries,
  tokenRateQueries,
} from './llmUsageQueries';

/**
 * The usage queries as `MimirService` rewrites them for an installation with
 * `mimir.matchers`: a platform on the workload cluster `gerbil`, its series in
 * its management cluster's Mimir next to the management cluster's own
 * platform. Without the matchers on every selector, its figures would add in
 * the other platform's usage, costs and agents.
 */
const MATCHERS = { cluster_id: 'gerbil', cluster_type: 'workload_cluster' };
const ENFORCED = 'cluster_id="gerbil",cluster_type="workload_cluster"';

const NOW = Date.parse('2026-11-14T10:00:00Z');

/** Every query the usage pages and the session strip send, by name. */
function usageQueries(): [string, string][] {
  const named = (prefix: string, queries: Record<string, string | undefined>) =>
    Object.entries(queries)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([name, query]): [string, string] => [`${prefix}.${name}`, query]);

  return [
    ...named('window', llmUsageQueriesFor({ now: NOW })),
    ...named('org', llmUsageQueriesFor({ org: 'team-a', now: NOW })),
    ...named('pastMonth', llmUsageQueriesFor({ month: '2026-09', now: NOW })),
    ...named('byPerson', byPersonQueriesFor({ now: NOW })),
    ...named('daily', llmUsageRangeQueriesFor({ org: 'team-a' })),
    ...named('today', todayPartialQueries('10h')),
    ...named('rates', tokenRateQueries()),
    ['organizationsSeen', organizationsSeenQueryFor({ now: NOW })],
    ['egressRefusals', egressRefusalsQuery({ atespace: 'a', name: 'b' })],
  ];
}

/** How many selectors carry every enforced matcher. */
function enforcedSelectors(query: string): number {
  return query.split(ENFORCED).length - 1;
}

/**
 * How many selectors a rewritten query has: each is a metric name with
 * braces once the matchers are in.
 */
function selectors(query: string): number {
  return (query.match(/[a-z_:][a-z0-9_:]*\{/gi) ?? []).length;
}

describe('the usage queries with enforced matchers', () => {
  it.each(usageQueries())(
    '%s: carries the matchers on every selector',
    (_, query) => {
      const rewritten = enforceMatchers(query, MATCHERS);

      expect(enforcedSelectors(rewritten)).toBeGreaterThan(0);
      expect(enforcedSelectors(rewritten)).toBe(selectors(rewritten));
    },
  );

  it('rewrites a counter increase, its first-sample term included', () => {
    const { cost } = tokenRateQueries();
    const rewritten = enforceMatchers(cost, MATCHERS);

    // `counterIncrease` names the series several times (the increase, the
    // series born inside the window, the birth lookback): every one is
    // limited, or a term would add in the other platform's series.
    expect(enforcedSelectors(rewritten)).toBeGreaterThan(1);
    expect(enforcedSelectors(rewritten)).toBe(selectors(rewritten));
  });

  it('keeps the organization filter next to the matchers', () => {
    const { cost } = llmUsageQueriesFor({ org: 'team-a', now: NOW });

    expect(enforceMatchers(cost, MATCHERS)).toContain(
      `agent_namespace="team-a",${ENFORCED}`,
    );
  });

  it('refuses a usage query that selects another cluster', () => {
    expect(() =>
      enforceMatchers(
        `${tokenRateQueries().cost} or up{cluster_id="golem"}`,
        MATCHERS,
      ),
    ).toThrow(QueryRefusedError);
  });

  it('sends every usage query as it is without matchers', () => {
    for (const [, query] of usageQueries()) {
      expect(enforceMatchers(query, {})).toBe(query);
    }
  });
});
