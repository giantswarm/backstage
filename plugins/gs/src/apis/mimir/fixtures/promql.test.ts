import type { FixtureCounterSeries } from '@giantswarm/backstage-plugin-gs-common/fixtures';
import { evaluatePromql, parseDuration, parsePromql } from './promql';

const DAY = 86400;
/** Day 10 at midnight, in seconds. */
const T = 10 * DAY;

/** A counter that grows by `perDay` a day from day 0 to day 10. */
function counter(
  labels: Record<string, string>,
  perDay: number,
  fromDay = 0,
): FixtureCounterSeries {
  const points: [number, number][] = [];
  for (let day = fromDay; day <= 10; day++) {
    points.push([day * DAY * 1000, (day - fromDay) * perDay]);
  }
  return { labels, points };
}

const series = [
  counter({ __name__: 'cost', agent: 'a', user: 'x' }, 1),
  counter({ __name__: 'cost', agent: 'a', user: 'y' }, 2),
  counter({ __name__: 'cost', agent: 'b', user: 'x' }, 4, 8),
  ...[
    ['1', 10],
    ['5', 30],
    ['+Inf', 40],
  ].map(([le, perDay]) =>
    counter(
      { __name__: 'duration_bucket', le: le as string },
      perDay as number,
    ),
  ),
];

function evaluate(query: string, time = T) {
  return evaluatePromql(parsePromql(query), series, time);
}

function samples(query: string, time = T) {
  const value = evaluate(query, time);
  if (value.kind !== 'vector') {
    throw new Error('not a vector');
  }
  return value.samples
    .map(s => ({ ...s.labels, value: s.value }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

describe('the fixture PromQL evaluator', () => {
  it('reads durations', () => {
    expect(parseDuration('30d')).toBe(30 * DAY);
    expect(parseDuration('1h30m')).toBe(5400);
    expect(parseDuration('86400')).toBe(DAY);
  });

  it('sums the growth of counters by labels', () => {
    expect(samples('sum by (agent) (increase(cost[2d]))')).toEqual([
      { agent: 'a', value: 6 },
      { agent: 'b', value: 8 },
    ]);
  });

  it('narrows by matchers and moves the window with offset and @', () => {
    expect(samples('sum (increase(cost{user="x"}[1d] offset 1d))')).toEqual([
      { value: 5 },
    ]);
    expect(
      samples(`sum (increase(cost{user=~"y|z"}[1d] @ ${5 * DAY}))`),
    ).toEqual([{ value: 2 }]);
  });

  it('counts a series born inside the window from its first point', () => {
    expect(samples('sum by (agent) (increase(cost{agent="b"}[30d]))')).toEqual([
      { agent: 'b', value: 8 },
    ]);
    // Before it was born there is nothing.
    expect(samples(`increase(cost{agent="b"}[1d] @ ${5 * DAY})`)).toEqual([]);
  });

  it('evaluates the portal’s counter increase shape', () => {
    const x = 'cost{user="x"}';
    const query = `sum by (agent) ((increase(${x}[2d]) or label_replace(min_over_time(${x}[2d]) unless last_over_time(${x}[1h] offset 2d), "first_sample", "true", "__name__", ".*")))`;
    expect(samples(query)).toEqual([
      { agent: 'a', value: 2 },
      // Born on day 8: its first value, zero, joins its growth.
      { agent: 'b', value: 8 },
    ]);
  });

  it('counts series and filters with comparisons', () => {
    expect(samples('count(last_over_time(cost[7d]))')).toEqual([{ value: 3 }]);
    expect(samples('sum by (user) (increase(cost[1d])) > 3')).toEqual([
      { user: 'x', value: 5 },
    ]);
  });

  it('takes quantiles of histograms', () => {
    // 40 a day: 10 at or below 1 s, 30 at or below 5 s.
    const [p50] = samples(
      'histogram_quantile(0.5, sum by (le) (increase(duration_bucket[1d])))',
    );
    expect(p50.value).toBeCloseTo(3);
    const [inverse] = samples(
      '1 / histogram_quantile(0.5, sum by (le) (increase(duration_bucket[1d])))',
    );
    expect(inverse.value).toBeCloseTo(1 / 3);
  });

  it('answers an empty vector for a metric without series', () => {
    expect(samples('sum(increase(kube_pod_info[1d]))')).toEqual([]);
  });

  it('refuses what it cannot read, as Mimir refuses a bad query', () => {
    expect(() => parsePromql('rate(cost[1d])')).toThrow(
      expect.objectContaining({ name: 'InputError' }),
    );
    expect(() => parsePromql('sum by (agent) (cost')).toThrow(
      expect.objectContaining({ name: 'InputError' }),
    );
    expect(() => evaluate('cost[1d]')).toThrow(
      expect.objectContaining({ name: 'InputError' }),
    );
  });
});
