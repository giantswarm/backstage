import { formatLocalDay, formatLocalTime } from './formatLocalDate';

describe('formatLocalTime', () => {
  it('shows the local time of day on a 24-hour clock', () => {
    expect(formatLocalTime(new Date(2026, 9, 2, 9, 5))).toBe('09:05');
    expect(formatLocalTime(new Date(2026, 9, 2, 14, 5, 59))).toBe('14:05');
  });

  it('returns a value that does not parse as given', () => {
    expect(formatLocalTime('not a date')).toBe('not a date');
  });
});

describe('formatLocalDay', () => {
  const day = new Date(2026, 8, 18, 22, 31);

  it('shows the local day, with the year only when it is another', () => {
    expect(formatLocalDay(day, 2026)).toBe('18 Sep');
    expect(formatLocalDay(day, 2027)).toBe('18 Sep 2026');
  });

  it('compares with the current year by default', () => {
    const now = new Date();
    expect(formatLocalDay(now)).not.toContain(String(now.getFullYear()));
  });

  it('returns a value that does not parse as given', () => {
    expect(formatLocalDay('not a date', 2026)).toBe('not a date');
  });
});
