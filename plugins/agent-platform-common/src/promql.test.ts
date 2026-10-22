import { counterIncrease, promqlString } from './promql';

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
});

describe('promqlString', () => {
  it('escapes what could end a label value or the query', () => {
    expect(promqlString('a"b\\c\nd')).toBe('a\\"b\\\\c\\nd');
  });
});
