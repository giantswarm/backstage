import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  formatUsageWindow,
  parseUsageWindow,
  USAGE_WINDOW_PARAM,
  usageWindowDaysOnly,
  type UsageWindow,
  type UsageWindowDays,
} from '../lib/usageWindow';

export type UsageWindowView = {
  /** The window the gateway views read: days back from today, or a month. */
  window: UsageWindow;
  /**
   * The window as whole days, for the views that read days only (Your
   * sessions, Connectors): the days window, or the default for a month.
   */
  days: UsageWindowDays;
  setWindow: (window: UsageWindow) => void;
};

/**
 * The Usage screen's selected time window, kept in the URL (`?window=7d`,
 * `?window=2026-10`).
 *
 * In the URL rather than in state so the scope survives a tab switch — the
 * second-level tabs are links that keep the query string — and travels in a
 * shared link, the same policy as the installation scope parameter beside it.
 * The default window stays out of the URL, so existing links are unchanged.
 *
 * `replace` rather than push: flipping the window is scope, not navigation,
 * and stacking a history entry per click makes Back useless.
 */
export function useUsageWindow(): UsageWindowView {
  const [searchParams, setSearchParams] = useSearchParams();
  const window = parseUsageWindow(searchParams.get(USAGE_WINDOW_PARAM));

  const setWindow = useCallback(
    (next: UsageWindow) => {
      setSearchParams(
        current => {
          const params = new URLSearchParams(current);
          const value = formatUsageWindow(next);
          if (value === undefined) {
            params.delete(USAGE_WINDOW_PARAM);
          } else {
            params.set(USAGE_WINDOW_PARAM, value);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { window, days: usageWindowDaysOnly(window), setWindow };
}
