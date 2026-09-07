import { formatCompactAge, formatDuration } from './duration';

describe('formatDuration', () => {
  const start = '2026-07-23T16:00:00.000Z';

  function at(offsetMs: number): string {
    return new Date(Date.parse(start) + offsetMs).toISOString();
  }

  it.each([
    [0, '0s'],
    [1_500, '2s'],
    [45_000, '45s'],
    [60_000, '1m'],
    [34 * 60_000, '34m'],
    [59 * 60_000 + 59_000, '59m'],
    [60 * 60_000, '1h'],
    [2 * 3_600_000 + 15 * 60_000, '2h 15m'],
    [24 * 3_600_000, '1d'],
    [27 * 3_600_000, '1d 3h'],
  ])('formats a %pms span as %s', (offset, expected) => {
    expect(formatDuration(start, at(offset as number))).toBe(expected);
  });

  it('shows seconds rather than rounding a quick answer to 0m', () => {
    // A one-shot question answered immediately is a real session, and "0m" would
    // read as missing data.
    expect(formatDuration(start, at(4_000))).toBe('4s');
  });

  it.each([
    [undefined, '2026-07-23T16:00:00.000Z'],
    ['2026-07-23T16:00:00.000Z', undefined],
    [undefined, undefined],
    ['nonsense', '2026-07-23T16:00:00.000Z'],
    ['2026-07-23T16:00:00.000Z', 'nonsense'],
  ])('returns undefined for (%p, %p)', (from, to) => {
    expect(formatDuration(from, to)).toBeUndefined();
  });

  it('returns undefined rather than a negative span', () => {
    // Clock skew between whoever wrote the timestamps and us. "-3m" is worse than
    // no answer.
    expect(formatDuration(at(60_000), start)).toBeUndefined();
  });
});

describe('formatCompactAge', () => {
  const now = Date.parse('2026-09-04T12:00:00.000Z');
  const ago = (ms: number) => now - ms;

  it.each([
    [0, '0s'],
    [4_000, '4s'],
    [45_000, '45s'],
    [60_000, '1m'],
    [16 * 60_000, '16m'],
    [59 * 60_000 + 59_000, '59m'],
    [60 * 60_000, '1h'],
    [2 * 3_600_000, '2h'],
    [24 * 3_600_000, '1d'],
    [3 * 24 * 3_600_000 + 4 * 3_600_000, '3d'],
  ])('renders a %pms age as %s', (offset, expected) => {
    expect(formatCompactAge(ago(offset as number), now)).toBe(expected);
  });

  it('shows one unit only, where formatDuration shows two', () => {
    // The rail's card is three lines in a 280px column; a second unit spends
    // width on precision nobody reads at a glance. This is the whole reason the
    // two formatters are separate rather than one with a flag.
    const twoHoursFive = ago(2 * 3_600_000 + 5 * 60_000);
    expect(formatCompactAge(twoHoursFive, now)).toBe('2h');
    expect(
      formatDuration(
        new Date(twoHoursFive).toISOString(),
        new Date(now).toISOString(),
      ),
    ).toBe('2h 5m');
  });

  it.each([
    ['undefined', undefined],
    ['NaN', Number.NaN],
  ])('returns undefined for %s', (_label, value) => {
    expect(formatCompactAge(value, now)).toBeUndefined();
  });

  it('returns undefined for an instant in the future', () => {
    // Clock skew between whoever wrote the timestamp and us. An age we cannot
    // compute is not zero, and "0s" would claim something just happened.
    expect(formatCompactAge(now + 60_000, now)).toBeUndefined();
  });
});
