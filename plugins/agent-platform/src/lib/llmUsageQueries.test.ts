import {
  counterIncrease,
  dailyRangeWindow,
  llmUsageQueriesFor,
  llmUsageRangeQueriesFor,
  todayPartialQueries,
  dailyWindowDayKeys,
  hasCompleteDays,
  todayDayKey,
  todayPartialRange,
  WINDOW_DAYS,
  windowDaysOf,
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

describe('llmUsageQueriesFor().outputTokensPerSecond', () => {
  it('inverts the median, not the mean', () => {
    // The mean of this histogram is unweighted by reply length, so a reply
    // that emitted three tokens after a long wait counts as much as a long
    // one — on `graveler` that turned a 63 tok/s median into 2 tok/s.
    expect(llmUsageQueriesFor().outputTokensPerSecond).toBe(
      `1 / histogram_quantile(0.50, sum by (le) ${counterIncrease(
        'agentgateway_gen_ai_server_time_per_output_token_bucket',
        '30d',
      )})`,
    );
  });
});

describe('llmUsageQueriesFor', () => {
  it('is the installation-wide 30-day set by default', () => {
    const { previousCost, ...queries } = llmUsageQueriesFor();

    expect(queries).toEqual(
      (({ previousCost: _, ...rest }) => rest)(
        llmUsageQueriesFor({ days: 30 }),
      ),
    );
    expect(previousCost).toBe(
      'sum by (agent_namespace, agent, gen_ai_response_model, gen_ai_token_type) (increase(agentgateway_gen_ai_client_cost_usd_total[30d] offset 30d) or label_replace(min_over_time(agentgateway_gen_ai_client_cost_usd_total[30d] offset 30d) unless last_over_time(agentgateway_gen_ai_client_cost_usd_total[1h] offset 60d), "first_sample", "true", "__name__", ".*"))',
    );
  });

  it('covers the window it is asked for', () => {
    const queries = llmUsageQueriesFor({ days: 7 });

    expect(queries.cost).toContain('[7d]');
    expect(queries.durationP95).toContain('[7d]');
    expect(queries.previousCost).toContain('[7d] offset 7d');
    // Newborn series are judged at the start of the previous window.
    expect(queries.previousCost).toContain('[1h] offset 14d');
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
    expect(queries.requestsByStatus).toBe(
      llmUsageQueriesFor().requestsByStatus,
    );
    expect(queries.unpricedLookups).toBe(llmUsageQueriesFor().unpricedLookups);
  });

  it('compares one organization over the window just before this one', () => {
    expect(llmUsageQueriesFor({ days: 7, org: 'support' }).previousCost).toBe(
      `sum by (agent_namespace, agent, gen_ai_response_model, gen_ai_token_type) ${counterIncrease(
        'agentgateway_gen_ai_client_cost_usd_total{agent_namespace="support"}',
        '7d',
        '7d',
      )}`,
    );
  });

  it('escapes an organization so it cannot change the query', () => {
    const { cost } = llmUsageQueriesFor({ org: 'a"} or vector(1) #\\' });

    expect(cost).toContain('{agent_namespace="a\\"} or vector(1) #\\\\"}');
  });

  it('filters the daily and today queries the same way', () => {
    expect(llmUsageRangeQueriesFor()).toEqual(llmUsageRangeQueriesFor({}));
    expect(llmUsageRangeQueriesFor({ org: 'support' }).costPerDayByModel).toBe(
      `sum by (gen_ai_response_model) ${counterIncrease(
        'agentgateway_gen_ai_client_cost_usd_total{agent_namespace="support"}',
        '1d',
      )}`,
    );
    expect(todayPartialQueries('600s', { org: 'support' }).tokensByType).toBe(
      `sum by (gen_ai_token_type) ${counterIncrease(
        'agentgateway_gen_ai_client_token_usage_sum{agent_namespace="support"}',
        '600s',
      )}`,
    );
  });
});

describe('dailyRangeWindow over another window', () => {
  it.each([2, 7, 90])(
    'stops one day short of %i days, ending at today’s midnight',
    days => {
      const range = dailyRangeWindow(MIDNIGHT + 12 * 60 * 60 * 1000, days);

      expect(hasCompleteDays(range)).toBe(true);
      expect(Number(range.end)).toBe(MIDNIGHT / 1000);
      expect((Number(range.end) - Number(range.start)) / 86_400 + 1).toBe(
        days - 1,
      );
    },
  );

  it.each([1, 0, -3, 0.4])(
    'holds no point for a %p-day window, so no range query runs',
    days => {
      const range = dailyRangeWindow(MIDNIGHT + 12 * 60 * 60 * 1000, days);

      expect(hasCompleteDays(range)).toBe(false);
      expect(Number(range.start)).toBeGreaterThan(Number(range.end));
    },
  );

  it('rounds a fractional window to whole days', () => {
    expect(dailyRangeWindow(MIDNIGHT, 6.6)).toEqual(
      dailyRangeWindow(MIDNIGHT, 7),
    );
  });
});

describe('dailyWindowDayKeys over another window', () => {
  const noon = MIDNIGHT + 12 * 60 * 60 * 1000;

  it.each([2, 7, 90])('lists %i days, oldest first, ending today', days => {
    const range = dailyRangeWindow(noon, days);
    const keys = dailyWindowDayKeys(range);

    expect(keys).toHaveLength(days);
    expect(keys.at(-1)).toBe('2026-09-11');
    expect(keys.at(-1)).toBe(todayDayKey(range));
    expect(keys[0]).toBe(
      new Date(MIDNIGHT - (days - 1) * DAY).toISOString().slice(0, 10),
    );
    expect(new Set(keys).size).toBe(days);
  });

  it('is today alone for a one-day window', () => {
    const range = dailyRangeWindow(noon, 1);

    expect(dailyWindowDayKeys(range)).toEqual(['2026-09-11']);
    expect(todayDayKey(range)).toBe('2026-09-11');
  });
});

describe('counterIncrease', () => {
  it('adds the first value of a series born inside the window to its increase()', () => {
    // Verified against Prometheus 3.12 (promtool) with a series older than the
    // window, one born in it holding 0.02 then 0.05, and one scraped once at
    // 0.03: bare increase() said 0.6303, this 0.6803, and the counters really
    // grew by 0.68.
    expect(counterIncrease('c{a="b"}', '30d')).toBe(
      '(increase(c{a="b"}[30d]) or label_replace(min_over_time(c{a="b"}[30d]) unless last_over_time(c{a="b"}[1h] offset 30d), "first_sample", "true", "__name__", ".*"))',
    );
  });

  it('judges a series newborn at the start of an offset window', () => {
    expect(counterIncrease('c', '7d', '7d')).toContain(
      'min_over_time(c[7d] offset 7d) unless last_over_time(c[1h] offset 14d)',
    );
    expect(counterIncrease('c', '7d', '7d')).toContain(
      'increase(c[7d] offset 7d)',
    );
  });

  it('adds seconds-based ranges up in seconds', () => {
    expect(counterIncrease('c', '600s')).toContain(
      'last_over_time(c[1h] offset 600s)',
    );
    expect(counterIncrease('c', '600s', '1d')).toContain('offset 87000s');
  });

  it('rejects a duration it cannot add up', () => {
    expect(() => counterIncrease('c', '1h30m')).toThrow(
      'Not a simple PromQL duration',
    );
  });

  it('is what every usage query counts with — no bare increase() or rate()', () => {
    const all = [
      ...Object.values(llmUsageQueriesFor({ days: 7, org: 'support' })),
      ...Object.values(llmUsageRangeQueriesFor()),
      ...Object.values(todayPartialQueries('600s')),
    ];
    for (const query of all) {
      expect(query).not.toMatch(/\brate\(/);
      // Each increase() is the left term of a counterIncrease.
      expect(query.split('increase(').length - 1).toBe(
        query.split('min_over_time(').length - 1,
      );
      expect(query).toContain('"first_sample", "true"');
    }
  });
});

describe('windowDaysOf', () => {
  it.each([
    [undefined, WINDOW_DAYS],
    [Number.NaN, WINDOW_DAYS],
    [Number.POSITIVE_INFINITY, WINDOW_DAYS],
    [7, 7],
    [6.6, 7],
    [0, 1],
    [-5, 1],
  ])('normalises %p to %i', (days, expected) => {
    expect(windowDaysOf(days)).toBe(expected);
  });
});
