import { formatCompactAge } from './duration';

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

  it('shows one unit only', () => {
    // The rail's card is three lines in a 280px column; a second unit spends
    // width on precision nobody reads at a glance.
    expect(formatCompactAge(ago(2 * 3_600_000 + 5 * 60_000), now)).toBe('2h');
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
