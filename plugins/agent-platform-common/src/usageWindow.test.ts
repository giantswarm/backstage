import { formatUsageDay, usageDataStart } from './usageWindow';

describe('usageDataStart', () => {
  const window = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'];

  it('says nothing when the data covers the window’s first day', () => {
    expect(usageDataStart(window, '2026-09-08')).toBeUndefined();
    expect(usageDataStart(window, '2026-08-01')).toBeUndefined();
  });

  it('says nothing without data, which the empty states cover', () => {
    expect(usageDataStart(window, undefined)).toBeUndefined();
    expect(usageDataStart([], '2026-09-09')).toBeUndefined();
  });

  it('names the first day with data and the days it covers', () => {
    expect(usageDataStart(window, '2026-09-10')).toEqual({
      day: '2026-09-10',
      coveredDays: 2,
    });
    expect(usageDataStart(window, '2026-09-11')).toEqual({
      day: '2026-09-11',
      coveredDays: 1,
    });
  });
});

describe('formatUsageDay', () => {
  it('formats a UTC day with its year', () => {
    expect(formatUsageDay('2026-09-09')).toBe(
      new Date(Date.UTC(2026, 8, 9)).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    );
    expect(formatUsageDay('2026-09-09')).toMatch(/9/);
    expect(formatUsageDay('2026-09-09')).toMatch(/2026/);
  });

  it('returns anything that is not a day unchanged', () => {
    expect(formatUsageDay('soon')).toBe('soon');
  });
});
