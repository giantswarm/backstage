import { getRelativeDate } from './getRelativeDate';

describe('getRelativeDate', () => {
  const now = new Date('2026-11-17T12:00:00Z');

  it('approximates by default', () => {
    expect(getRelativeDate('2026-10-15T12:00:00Z', now)).toBe(
      'about 1 month ago',
    );
    expect(getRelativeDate('2026-11-17T11:59:50Z', now)).toBe(
      'less than a minute ago',
    );
  });

  it('gives the plain count when strict', () => {
    expect(getRelativeDate('2026-10-15T12:00:00Z', now, { strict: true })).toBe(
      '1 month ago',
    );
    expect(getRelativeDate('2026-11-17T11:59:30Z', now, { strict: true })).toBe(
      '30 seconds ago',
    );
    expect(getRelativeDate('2026-11-18T12:00:00Z', now, { strict: true })).toBe(
      'in 1 day',
    );
  });

  it('gives back a value it cannot parse', () => {
    expect(getRelativeDate('soon', now)).toBe('soon');
  });
});
