import { formatCount, formatTokens } from './formatNumbers';

describe('formatTokens', () => {
  it('leaves a small count exact', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
  });

  it('compacts thousands and millions', () => {
    expect(formatTokens(1_000)).toBe('1.0k');
    expect(formatTokens(1_500)).toBe('1.5k');
    expect(formatTokens(2_600)).toBe('2.6k');
    expect(formatTokens(999_999)).toBe('1000.0k');
    expect(formatTokens(1_200_000)).toBe('1.2M');
    expect(formatTokens(1_400_000)).toBe('1.4M');
    expect(formatTokens(8_400_000)).toBe('8.4M');
  });
});

describe('formatCount', () => {
  it('separates thousands rather than compacting', () => {
    // A turn or tool-call count is small enough to read exactly, and a reader
    // may reconcile it against a list.
    expect(formatCount(0)).toBe('0');
    expect(formatCount(231)).toBe('231');
    expect(formatCount(1_040)).toBe((1040).toLocaleString());
  });

  it('rounds a fractional value', () => {
    expect(formatCount(2.6)).toBe('3');
  });
});
