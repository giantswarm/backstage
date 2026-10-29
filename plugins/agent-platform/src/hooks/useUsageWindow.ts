import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  formatUsageWindowParam,
  parseUsageWindowParam,
  USAGE_WINDOW_PARAM,
  type UsageWindowDays,
} from '../lib/usageWindow';

export type UsageWindowView = {
  /** The window every gateway-derived Usage view reads, in whole days. */
  days: UsageWindowDays;
  setDays: (days: UsageWindowDays) => void;
};

/**
 * The Usage screen's selected time window, kept in the URL (`?window=7d`).
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
  const days = parseUsageWindowParam(searchParams.get(USAGE_WINDOW_PARAM));

  const setDays = useCallback(
    (next: UsageWindowDays) => {
      setSearchParams(
        current => {
          const params = new URLSearchParams(current);
          const value = formatUsageWindowParam(next);
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

  return { days, setDays };
}
