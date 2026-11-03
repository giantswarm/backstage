import {
  formatDayTick,
  formatDayTooltip,
  formatDayWithYear,
} from './formatDay';

/** What the browser's locale makes of 4 Sep 2026 (UTC) with `options`. */
function expected(options: Intl.DateTimeFormatOptions): string {
  return new Date(Date.UTC(2026, 8, 4)).toLocaleDateString(undefined, {
    ...options,
    timeZone: 'UTC',
  });
}

describe('day labels', () => {
  it('labels a UTC day in each of the three formats', () => {
    expect(formatDayTick('2026-09-04')).toBe(
      expected({ day: 'numeric', month: 'short' }),
    );
    expect(formatDayTooltip('2026-09-04')).toBe(
      expected({
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    );
    expect(formatDayWithYear('2026-09-04')).toBe(
      expected({ day: 'numeric', month: 'short', year: 'numeric' }),
    );
    expect(formatDayWithYear('2026-09-04')).toMatch(/2026/);
  });

  it('returns anything that is not a day unchanged', () => {
    expect(formatDayTick('soon')).toBe('soon');
    expect(formatDayTooltip('soon')).toBe('soon');
    expect(formatDayWithYear('soon')).toBe('soon');
  });
});
