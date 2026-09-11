import {
  formatCount,
  formatPercent,
  formatSeconds,
  formatTokens,
  formatUsd,
} from './formatNumbers';

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

describe('formatUsd', () => {
  it('scales precision with magnitude, across the six orders these span', () => {
    // One fixed precision reads as either "$0.00" for a session or
    // "$1,234.5678" for a fleet-month.
    expect(formatUsd(0.0004)).toBe('<$0.01');
    expect(formatUsd(0.0432)).toBe('$0.043');
    expect(formatUsd(4.5)).toBe('$4.50');
    expect(formatUsd(1234.56)).toBe('$1,235');
  });

  it('distinguishes no rate from no spend', () => {
    // The whole point: "—" means nothing could be priced, "$0.00" means
    // nothing was spent at a known rate. Collapsing them would state that an
    // unpriced platform is free.
    expect(formatUsd(undefined)).toBe('—');
    expect(formatUsd(0)).toBe('$0.00');
  });

  it('never renders a real, tiny amount as free', () => {
    expect(formatUsd(0.000001)).toBe('<$0.01');
  });

  it('is an em dash for a non-finite value', () => {
    expect(formatUsd(Number.NaN)).toBe('—');
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('keeps a negative sign', () => {
    expect(formatUsd(-4.5)).toBe('-$4.50');
  });
});

describe('formatPercent', () => {
  it('keeps a decimal below ten percent and drops it above', () => {
    expect(formatPercent(4.25)).toBe('4.3%');
    expect(formatPercent(62.4)).toBe('62%');
  });

  it('is an em dash for an undefined or non-finite share', () => {
    expect(formatPercent(undefined)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
  });
});

describe('formatSeconds', () => {
  it('switches to milliseconds under a second', () => {
    expect(formatSeconds(0.42)).toBe('420ms');
    expect(formatSeconds(1.5)).toBe('1.5s');
    expect(formatSeconds(42)).toBe('42s');
  });

  it('is an em dash for an empty histogram', () => {
    // histogram_quantile over no observations is NaN, which is the normal
    // answer on an idle installation — not an error, and not 0ms.
    expect(formatSeconds(Number.NaN)).toBe('—');
    expect(formatSeconds(undefined)).toBe('—');
  });
});
