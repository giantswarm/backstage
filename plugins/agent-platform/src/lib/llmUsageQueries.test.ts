import {
  dailyRangeWindow,
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
