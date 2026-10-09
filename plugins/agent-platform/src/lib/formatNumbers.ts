/**
 * Number formatting for the Agent Platform's own quantities.
 *
 * Domain formatters rather than UI primitives — tokens and call counts, not
 * generic display — which is why they live here and not in `ui-react`.
 *
 * **One fixed presentation, `en-US`, whatever the browser's locale.** The
 * decimal mark is already fixed: `toFixed` writes `$4.50`, `1.5k` and `4.3%`
 * with a point on every machine, so the thousands grouping has to be fixed to
 * match. Left to the runtime's default locale, a German browser renders
 * `$4.50` next to `$1.235` — one `.` a decimal mark, the other a grouping
 * mark, in the same column. This is also how `ui-react` and `gs` present
 * figures and dates (`d MMM yyyy, HH:mm UTC`): the portal's own notation, not
 * the reader's.
 */

import { useMemo } from 'react';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

/** Thousands grouping (`1,040`), the same on every machine. */
const grouped = new Intl.NumberFormat('en-US');

/** Format a token count compactly (`1.5k`, `1.2M`). */
export function formatTokens(total: number): string {
  if (total < 1000) {
    return String(total);
  }
  if (total < 1_000_000) {
    return `${(total / 1000).toFixed(1)}k`;
  }
  return `${(total / 1_000_000).toFixed(1)}M`;
}

/**
 * Format a plain count with thousands separators.
 *
 * Not compacted the way tokens are: a turn or tool-call count is small enough
 * to read exactly, and rounding "1,040 calls" to "1.0k" would lose a figure
 * someone might reconcile against a list.
 */
export function formatCount(value: number): string {
  return grouped.format(Math.round(value));
}

/** A currency to show costs in; see `InstallationCurrency` in the gs plugin. */
export type Currency = {
  /** ISO 4217 code, e.g. `EUR`. */
  code: string;
  /** The amount of `code` one USD buys. Required for any code but USD. */
  usdRate?: number;
};

export const USD: Currency = { code: 'USD' };

/** The currency's symbol as `en-US` writes it (`$`, `€`, `£`, `CHF`). */
function currencySymbol(code: string): string | undefined {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find(part => part.type === 'currency')?.value;
  } catch {
    return undefined;
  }
}

type ResolvedCurrency = { symbol: string; usdRate: number };

/**
 * The currency costs can actually be shown in: USD unless `currency` names a
 * valid code with a positive, finite rate. Showing a converted figure needs the
 * rate, so a code without one falls back to USD rather than relabelling a USD
 * amount.
 */
function resolveCurrency(currency: Currency | undefined): ResolvedCurrency {
  const usd = { symbol: '$', usdRate: 1 };
  if (!currency) {
    return usd;
  }
  const code = currency.code.trim().toUpperCase();
  if (code === 'USD' || !/^[A-Z]{3}$/.test(code)) {
    return usd;
  }
  const rate = currency.usdRate;
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
    return usd;
  }
  const symbol = currencySymbol(code);
  return symbol ? { symbol, usdRate: rate } : usd;
}

/**
 * Format an estimated cost, given in USD, in `currency`, or `—` when there is
 * nothing to price.
 *
 * `undefined` means **no rate could be derived** — every model in the window
 * was missing from the gateway's price catalogue — which is a different fact
 * from zero spend. Rendering it as `$0.00` would state confidently that the
 * platform is free. See `deriveTokenRates` for where that distinction is made.
 *
 * The precision follows the magnitude because these amounts span six orders:
 * a single session costs fractions of a cent while a month across a fleet runs
 * to thousands, and one fixed precision reads as either `$0.00` or
 * `$1,234.5678`. The thresholds apply to the converted amount.
 *
 * A currency other than USD needs its `usdRate`; without one the amount shows
 * in USD.
 */
export function formatMoney(
  usd: number | undefined,
  currency: Currency = USD,
): string {
  if (usd === undefined || !Number.isFinite(usd)) {
    return '—';
  }
  const { symbol, usdRate } = resolveCurrency(currency);
  const value = usd * usdRate;
  if (value === 0) {
    return `${symbol}0.00`;
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  // Not `$0.00`: a real, priced, very small amount must not read as free.
  if (abs < 0.01) {
    return `${sign}<${symbol}0.01`;
  }
  if (abs < 1) {
    return `${sign}${symbol}${abs.toFixed(3)}`;
  }
  if (abs < 100) {
    return `${sign}${symbol}${abs.toFixed(2)}`;
  }
  return `${sign}${symbol}${grouped.format(Math.round(abs))}`;
}

/** Format an estimated USD amount in USD; see {@link formatMoney}. */
export function formatUsd(value: number | undefined): string {
  return formatMoney(value, USD);
}

/**
 * The currency an installation shows costs in, from its
 * `gs.installations.<name>.currency` setting in the signed-in config; USD when
 * it has none, the installation is not known or the config has not loaded.
 */
export function useCurrency(installation: string | undefined): Currency {
  const { config } = useSignedInConfig();
  return useMemo(() => {
    if (!config || !installation) {
      return USD;
    }
    const installations =
      config.getOptional<Record<string, { currency?: Currency }>>(
        'gs.installations',
      ) ?? {};
    const currency = Object.prototype.hasOwnProperty.call(
      installations,
      installation,
    )
      ? installations[installation]?.currency
      : undefined;
    return currency?.code ? currency : USD;
  }, [config, installation]);
}

/** Format a percentage, or `—`. One decimal below 10%, none above. */
export function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return Math.abs(value) < 10
    ? `${value.toFixed(1)}%`
    : `${Math.round(value)}%`;
}

/**
 * Format a generation speed in tokens per second, or `—`.
 *
 * **Two significant figures, because the source histogram is coarse.** Its
 * buckets are `0.001, 0.01, 0.025, 0.05, …, 1.0, 2.5` seconds per token, so a
 * median is interpolated *inside* one of them: a value in the `(0.001, 0.01]`
 * bucket is somewhere between 100 and 1000 tok/s, and printing it as `197/s`
 * claims three digits of a measurement that has barely one. `200/s` is the
 * same number without the false precision.
 *
 * Below 1 the figure is not rounded but named, for the same reason `—` is not
 * `0`: a median that lands in the overflow bucket comes back as the top finite
 * bound, 2.5 s per token, which is 0.4 tok/s — and `0/s` next to a non-zero
 * call count reads as a broken page rather than as a very slow one.
 */
export function formatTokensPerSecond(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  if (value < 1) {
    return '<1/s';
  }
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  const rounded = Math.round(value / magnitude) * magnitude;
  return `${grouped.format(rounded)}/s`;
}

/**
 * Format a latency in seconds, or `—`.
 *
 * `undefined` is the normal answer for an idle installation, not an error:
 * `histogram_quantile` over a histogram with no observations is `NaN`.
 */
export function formatSeconds(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  if (value < 1) {
    return `${Math.round(value * 1000)}ms`;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)}s`;
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

/** Bytes → a short binary-prefixed figure: 6594474711 → "6.1 GiB". */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Whole bytes are exact; above that one decimal until the figure has three
  // digits, where a decimal is noise ("498 MiB", "6.1 GiB").
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}
