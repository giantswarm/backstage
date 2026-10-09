import { ConfigReader } from '@backstage/config';
import {
  __resetSignedInConfigForTests,
  setSignedInConfig,
} from '@giantswarm/backstage-plugin-gs-react';
import { act, renderHook } from '@testing-library/react';
import {
  formatBytes,
  formatMoney,
  formatCount,
  formatPercent,
  formatSeconds,
  formatTokens,
  formatTokensPerSecond,
  formatUsd,
  USD,
  useCurrency,
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
    expect(formatCount(1_040)).toBe('1,040');
  });

  it('groups the en-US way on every machine', () => {
    // The literal, not `(1040).toLocaleString()`: the grouping is pinned to
    // en-US so the figure matches the point `toFixed` writes elsewhere, and a
    // de-DE runtime must not turn this into "1.040".
    expect(formatCount(1_234_567)).toBe('1,234,567');
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

describe('formatTokensPerSecond', () => {
  it("keeps two significant figures, not the histogram's false precision", () => {
    // The source buckets are 0.001, 0.01, 0.025 … seconds per token, so a
    // median inside the second bucket is only known to be 100–1000 tok/s.
    // `197/s` would claim three digits of that.
    expect(formatTokensPerSecond(196.82)).toBe('200/s');
    expect(formatTokensPerSecond(62.6)).toBe('63/s');
    expect(formatTokensPerSecond(1234.5)).toBe('1,200/s');
  });

  it('never rounds a slow platform down to zero', () => {
    // A median in the overflow bucket comes back as the top finite bound,
    // 2.5 s per token — 0.4 tok/s. Rounded, that is the "0/s" this whole
    // figure exists to avoid, sitting next to a non-zero call count.
    expect(formatTokensPerSecond(0.4)).toBe('<1/s');
    expect(formatTokensPerSecond(0.99)).toBe('<1/s');
    expect(formatTokensPerSecond(1)).toBe('1/s');
  });

  it('is an em dash when nothing streamed', () => {
    // No streamed call means no observation, so the ratio has no series and
    // Mimir can also answer the division as NaN — neither is "0 tokens/s".
    expect(formatTokensPerSecond(undefined)).toBe('—');
    expect(formatTokensPerSecond(Number.NaN)).toBe('—');
  });
});

describe('formatBytes', () => {
  it('humanises byte sizes with binary prefixes', () => {
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(522653767)).toBe('498 MiB');
    expect(formatBytes(6594474711)).toBe('6.1 GiB');
    expect(formatBytes(34254796848)).toBe('31.9 GiB');
    expect(formatBytes(120 * 1024 ** 3)).toBe('120 GiB');
  });
});

describe('formatMoney', () => {
  const eur = { code: 'EUR', usdRate: 0.9 };

  it('formats USD exactly as formatUsd does', () => {
    for (const value of [
      undefined,
      NaN,
      0,
      0.0004,
      0.0432,
      4.5,
      -4.5,
      1234.4,
    ]) {
      expect(formatMoney(value)).toBe(formatUsd(value));
      expect(formatMoney(value, USD)).toBe(formatUsd(value));
    }
  });

  it('converts at the rate and writes the currency’s symbol', () => {
    expect(formatMoney(10, eur)).toBe('€9.00');
    expect(formatMoney(0.5, eur)).toBe('€0.450');
    expect(formatMoney(2000, eur)).toBe('€1,800');
    expect(formatMoney(-10, eur)).toBe('-€9.00');
    expect(formatMoney(0.001, eur)).toBe('<€0.01');
    expect(formatMoney(0, eur)).toBe('€0.00');
  });

  it('applies the precision to the converted amount', () => {
    // $110 is €99, which keeps its cents.
    expect(formatMoney(110, eur)).toBe('€99.00');
  });

  it('keeps an unpriced amount unknown in any currency', () => {
    expect(formatMoney(undefined, eur)).toBe('—');
  });

  it.each([
    ['no rate', { code: 'EUR' }],
    ['a zero rate', { code: 'EUR', usdRate: 0 }],
    ['a negative rate', { code: 'EUR', usdRate: -1 }],
    ['an infinite rate', { code: 'EUR', usdRate: Infinity }],
    ['an invalid code', { code: 'euro', usdRate: 0.9 }],
    ['an unknown code', { code: 'XYZQ', usdRate: 0.9 }],
  ])('falls back to USD for %s', (_, currency) => {
    expect(formatMoney(10, currency)).toBe('$10.00');
  });

  it('reads the code case-insensitively', () => {
    expect(formatMoney(10, { code: 'gbp', usdRate: 0.5 })).toBe('£5.00');
  });
});

describe('useCurrency', () => {
  beforeEach(() => __resetSignedInConfigForTests());

  function publish(installations: Record<string, object>) {
    setSignedInConfig(new ConfigReader({ gs: { installations } }));
  }

  it('returns the installation’s currency', () => {
    publish({
      golem: { pipeline: 'stable', currency: { code: 'EUR', usdRate: 0.9 } },
      gazelle: { pipeline: 'stable' },
    });

    expect(renderHook(() => useCurrency('golem')).result.current).toEqual({
      code: 'EUR',
      usdRate: 0.9,
    });
  });

  it.each([['gazelle'], ['unknown'], ['constructor'], [undefined]])(
    'returns USD for %p',
    installation => {
      publish({ gazelle: { pipeline: 'stable' } });

      expect(renderHook(() => useCurrency(installation)).result.current).toBe(
        USD,
      );
    },
  );

  it('returns USD until the signed-in config loads, then the currency', () => {
    const { result } = renderHook(() => useCurrency('golem'));
    expect(result.current).toBe(USD);

    act(() => publish({ golem: { currency: { code: 'GBP', usdRate: 0.8 } } }));

    expect(result.current).toEqual({ code: 'GBP', usdRate: 0.8 });
  });

  it('keeps the same object across renders', () => {
    publish({ golem: { currency: { code: 'EUR', usdRate: 0.9 } } });
    const { result, rerender } = renderHook(() => useCurrency('golem'));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
