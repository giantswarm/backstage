import {
  dailyRangeWindow,
  llmUsageQueries,
  llmUsageQueriesFor,
  llmUsageRangeQueries,
  llmUsageRangeQueriesFor,
  todayPartialQueries,
  dailyWindowDayKeys,
  todayDayKey,
  todayPartialRange,
  WINDOW_DAYS,
} from './llmUsageQueries';

const DAY = 86_400_000;
/** 2026-09-11T00:00:00Z, a UTC midnight. */
const MIDNIGHT = Date.parse('2026-09-11T00:00:00Z');

describe('todayPartialRange', () => {
  it('is stable across a render, which is what the query key needs', () => {
    // The regression this exists for: an unsnapped value changed every second,
    // so the response landing re-rendered, re-keyed `useMimirQuery`, and
    // refetched — forever, with both gateway tabs stuck on a spinner.
    const base = MIDNIGHT + 3 * 60 * 60 * 1000;

    expect(todayPartialRange(base)).toBe(todayPartialRange(base + 1_000));
    expect(todayPartialRange(base)).toBe(todayPartialRange(base + 60_000));
    expect(todayPartialRange(base)).toBe(todayPartialRange(base + 299_000));
  });

  it('advances once per snap interval, not per second', () => {
    const base = MIDNIGHT + 3 * 60 * 60 * 1000;

    expect(todayPartialRange(base)).toBe('10800s');
    expect(todayPartialRange(base + 300_000)).toBe('11100s');
  });

  it('never covers more than the elapsed day', () => {
    // Snapped *down*, so the range can never reach back into yesterday and
    // pull its tail into today's bar.
    for (const minutes of [1, 7, 59, 61, 600, 1439]) {
      const now = MIDNIGHT + minutes * 60_000;
      const seconds = Number(todayPartialRange(now).replace('s', ''));
      expect(seconds).toBeLessThanOrEqual(Math.max(minutes * 60, 60));
    }
  });

  it('is a legal duration just after midnight', () => {
    // A zero-length range is not valid PromQL, so the floor is a minute.
    expect(todayPartialRange(MIDNIGHT)).toBe('60s');
    expect(todayPartialRange(MIDNIGHT + 10_000)).toBe('60s');
  });
});

describe('dailyRangeWindow', () => {
  it('snaps every boundary to a UTC midnight, so it is stable all day', () => {
    const morning = dailyRangeWindow(MIDNIGHT + 60_000);
    const evening = dailyRangeWindow(MIDNIGHT + 23 * 60 * 60 * 1000);

    expect(morning).toEqual(evening);
    expect(Number(morning.end) % 86_400).toBe(0);
    expect(Number(morning.start) % 86_400).toBe(0);
    expect(morning.step).toBe('86400');
  });

  it('ends at today’s midnight, so no point lies in the future', () => {
    // A point in the future makes `increase()` extrapolate a partial day up to
    // a whole one, always on the newest and most-read bar.
    const { end } = dailyRangeWindow(MIDNIGHT + 12 * 60 * 60 * 1000);

    expect(Number(end) * 1000).toBe(MIDNIGHT);
  });

  it('stops one day short, because today comes from its own query', () => {
    const { start, end } = dailyRangeWindow(MIDNIGHT);
    const points = (Number(end) - Number(start)) / 86_400 + 1;

    expect(points).toBe(WINDOW_DAYS - 1);
  });
});

describe('dailyWindowDayKeys', () => {
  it('returns exactly the window, oldest first, ending today', () => {
    const keys = dailyWindowDayKeys(
      dailyRangeWindow(MIDNIGHT + 12 * 60 * 60 * 1000),
    );

    expect(keys).toHaveLength(WINDOW_DAYS);
    expect(keys[keys.length - 1]).toBe('2026-09-11');
    expect(keys[keys.length - 1]).toBe(
      todayDayKey(dailyRangeWindow(MIDNIGHT + 12 * 60 * 60 * 1000)),
    );
    expect(keys[0]).toBe(
      new Date(MIDNIGHT - (WINDOW_DAYS - 1) * DAY).toISOString().slice(0, 10),
    );
  });

  it('is contiguous, with no gap or repeat', () => {
    const keys = dailyWindowDayKeys(dailyRangeWindow(MIDNIGHT));

    for (let i = 1; i < keys.length; i += 1) {
      const previous = Date.parse(`${keys[i - 1]}T00:00:00Z`);
      expect(Date.parse(`${keys[i]}T00:00:00Z`) - previous).toBe(DAY);
    }
  });

  it('is stable all day, like the window it mirrors', () => {
    expect(dailyWindowDayKeys(dailyRangeWindow(MIDNIGHT + 60_000))).toEqual(
      dailyWindowDayKeys(dailyRangeWindow(MIDNIGHT + 23 * 60 * 60 * 1000)),
    );
  });
});

describe('llmUsageQueries.outputTokensPerSecond', () => {
  it('inverts the median, not the mean', () => {
    // The mean of this histogram is unweighted by reply length, so a reply
    // that emitted three tokens after a long wait counts as much as a long
    // one — on `graveler` that turned a 63 tok/s median into 2 tok/s.
    expect(llmUsageQueries.outputTokensPerSecond).toBe(
      '1 / histogram_quantile(0.50, sum by (le) (rate(agentgateway_gen_ai_server_time_per_output_token_bucket[30d])))',
    );
  });
});

describe('llmUsageQueriesFor', () => {
  it('is the installation-wide 30-day set by default', () => {
    const { previousCost, ...queries } = llmUsageQueriesFor();

    expect(queries).toEqual(llmUsageQueries);
    expect(previousCost).toBe(
      'sum by (agent_namespace, agent, gen_ai_response_model, gen_ai_token_type) (increase(agentgateway_gen_ai_client_cost_usd_total[30d] offset 30d))',
    );
  });

  it('covers the window it is asked for', () => {
    const queries = llmUsageQueriesFor({ days: 7 });

    expect(queries.cost).toContain('[7d]');
    expect(queries.durationP95).toContain('[7d]');
    expect(queries.previousCost).toContain('[7d] offset 7d');
    expect(queries.cost).not.toContain('30d');
  });

  it.each([0, -3, NaN, 2.6])(
    'keeps the window a positive whole number for %p',
    days => {
      const { cost } = llmUsageQueriesFor({ days });
      const window = Number(/\[(\d+)d\]/.exec(cost)?.[1]);
      expect(Number.isInteger(window)).toBe(true);
      expect(window).toBeGreaterThanOrEqual(1);
    },
  );

  it('restricts the gen_ai metrics to one organization', () => {
    const queries = llmUsageQueriesFor({ org: 'support' });
    const only = '{agent_namespace="support"}';

    for (const key of [
      'cost',
      'tokens',
      'calls',
      'outputTokensPerSecond',
      'durationP50',
      'durationP95',
      'previousCost',
    ] as const) {
      expect(queries[key]).toContain(only);
    }
    // Their metrics carry no namespace label.
    expect(queries.requestsByStatus).toBe(llmUsageQueries.requestsByStatus);
    expect(queries.unpricedLookups).toBe(llmUsageQueries.unpricedLookups);
  });

  it('escapes an organization so it cannot change the query', () => {
    const { cost } = llmUsageQueriesFor({ org: 'a"} or vector(1) #\\' });

    expect(cost).toContain('{agent_namespace="a\\"} or vector(1) #\\\\"}');
  });

  it('filters the daily and today queries the same way', () => {
    expect(llmUsageRangeQueriesFor()).toEqual(llmUsageRangeQueries);
    expect(llmUsageRangeQueriesFor({ org: 'support' }).costPerDayByModel).toBe(
      'sum by (gen_ai_response_model) (increase(agentgateway_gen_ai_client_cost_usd_total{agent_namespace="support"}[1d]))',
    );
    expect(todayPartialQueries('600s', { org: 'support' }).tokensByType).toBe(
      'sum by (gen_ai_token_type) (increase(agentgateway_gen_ai_client_token_usage_sum{agent_namespace="support"}[600s]))',
    );
  });
});

describe('dailyRangeWindow over another window', () => {
  it('stops one day short of the days it is given', () => {
    const { start, end } = dailyRangeWindow(MIDNIGHT, 7);
    expect((Number(end) - Number(start)) / 86_400 + 1).toBe(6);
  });
});
