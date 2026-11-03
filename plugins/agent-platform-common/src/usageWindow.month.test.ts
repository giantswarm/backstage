import {
  DEFAULT_USAGE_WINDOW_DAYS,
  formatUsageWindow,
  lastDaysNoun,
  parseUsageWindow,
  previousUsageMonth,
  USAGE_MONTHS_OFFERED,
  usageMonthBounds,
  usageMonthLabel,
  usageMonthOf,
  usageMonthOptions,
  usageWindowDaysOnly,
  usageWindowNoun,
  usageWindowPhrase,
} from './usageWindow';

/** 2026-11-02T10:00:00Z: the second of a month, for a current month with one complete day. */
const NOW = Date.parse('2026-11-02T10:00:00Z');

describe('usageMonthOf and previousUsageMonth', () => {
  it('names a month in UTC and steps back across the year', () => {
    expect(usageMonthOf(NOW)).toBe('2026-11');
    expect(usageMonthOf(Date.parse('2026-01-31T23:59:59Z'))).toBe('2026-01');
    expect(previousUsageMonth('2026-11')).toBe('2026-10');
    expect(previousUsageMonth('2026-01')).toBe('2025-12');
  });
});

describe('usageMonthOptions', () => {
  it('offers this month and the months before it, newest first', () => {
    expect(usageMonthOptions(NOW)).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(usageMonthOptions(NOW)).toHaveLength(USAGE_MONTHS_OFFERED);
  });
});

describe('usageMonthBounds', () => {
  it('spans the month’s UTC midnights and counts its days', () => {
    const october = usageMonthBounds('2026-10', NOW);
    expect(october.start).toBe(Date.parse('2026-10-01T00:00:00Z') / 1000);
    expect(october.end).toBe(Date.parse('2026-11-01T00:00:00Z') / 1000);
    expect(october.days).toBe(31);
    expect(october.current).toBe(false);
    expect(usageMonthBounds('2026-02', NOW).days).toBe(28);
  });

  it('knows the month still being written', () => {
    expect(usageMonthBounds('2026-11', NOW).current).toBe(true);
    expect(
      usageMonthBounds('2026-11', Date.parse('2026-12-01T00:00:00Z')).current,
    ).toBe(false);
  });
});

describe('parseUsageWindow', () => {
  it('reads the days windows as before', () => {
    expect(parseUsageWindow('7d', NOW)).toEqual({ kind: 'days', days: 7 });
    expect(parseUsageWindow('90', NOW)).toEqual({ kind: 'days', days: 90 });
    expect(parseUsageWindow(null, NOW)).toEqual({
      kind: 'days',
      days: DEFAULT_USAGE_WINDOW_DAYS,
    });
  });

  it('reads a month the select offers', () => {
    expect(parseUsageWindow('2026-10', NOW)).toEqual({
      kind: 'month',
      month: '2026-10',
    });
    expect(parseUsageWindow(' 2026-11 ', NOW)).toEqual({
      kind: 'month',
      month: '2026-11',
    });
  });

  it('is the default for a month the select does not offer, or no month at all', () => {
    // The records would not cover it, and the control could not show it.
    expect(parseUsageWindow('2026-08', NOW)).toEqual({
      kind: 'days',
      days: DEFAULT_USAGE_WINDOW_DAYS,
    });
    expect(parseUsageWindow('2026-12', NOW).kind).toBe('days');
    expect(parseUsageWindow('2026-13', NOW).kind).toBe('days');
    expect(parseUsageWindow('october', NOW).kind).toBe('days');
  });
});

describe('formatUsageWindow', () => {
  it('writes what parse reads, and keeps the default out of the URL', () => {
    expect(formatUsageWindow({ kind: 'month', month: '2026-10' })).toBe(
      '2026-10',
    );
    expect(formatUsageWindow({ kind: 'days', days: 7 })).toBe('7d');
    expect(
      formatUsageWindow({ kind: 'days', days: DEFAULT_USAGE_WINDOW_DAYS }),
    ).toBeUndefined();
  });
});

describe('usageWindowDaysOnly', () => {
  it('gives a days-only view the days, or the default for a month', () => {
    expect(usageWindowDaysOnly({ kind: 'days', days: 7 })).toBe(7);
    expect(usageWindowDaysOnly({ kind: 'month', month: '2026-10' })).toBe(
      DEFAULT_USAGE_WINDOW_DAYS,
    );
  });
});

describe('the window in words', () => {
  it('names days back from today in words, one day in the singular', () => {
    expect(lastDaysNoun(7)).toBe('the last 7 days');
    expect(lastDaysNoun(30)).toBe('the last 30 days');
    expect(lastDaysNoun(1)).toBe('the last day');
    expect(usageWindowPhrase({ kind: 'days', days: 1 }, NOW)).toBe(
      'over the last day',
    );
  });

  it('names a past month, and the current one as so far', () => {
    expect(usageMonthLabel('2026-10', NOW)).toBe('October 2026');
    expect(usageMonthLabel('2026-11', NOW)).toBe('November 2026 so far');
  });

  it('reads as a noun and in a sentence', () => {
    expect(usageWindowNoun({ kind: 'days', days: 30 }, NOW)).toBe(
      'the last 30 days',
    );
    expect(usageWindowNoun({ kind: 'month', month: '2026-10' }, NOW)).toBe(
      'October 2026',
    );
    expect(usageWindowPhrase({ kind: 'days', days: 7 }, NOW)).toBe(
      'over the last 7 days',
    );
    expect(usageWindowPhrase({ kind: 'month', month: '2026-11' }, NOW)).toBe(
      'in November 2026 so far',
    );
  });
});
