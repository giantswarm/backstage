import type { RouteTabSpec } from '@giantswarm/backstage-plugin-ui-react';

/**
 * A model page's tabs, each its own address under the page's. Overview is the
 * index, so the page's own address. Exported for telemetry, which reports the
 * tab as the page view's `view` and needs the closed set.
 */
export const MODEL_PAGE_TABS: RouteTabSpec[] = [
  { id: 'overview', path: '', title: 'Overview' },
  { id: 'usage', path: 'usage', title: 'Usage' },
  { id: 'used-by', path: 'used-by', title: 'Used by' },
  { id: 'details', path: 'details', title: 'Details' },
];

/**
 * The tabs with Used by's count, the number of agents running on the model,
 * as the skill page counts its Used by tab. No count while the agents load,
 * or where they could not be read.
 */
export function modelPageTabs({
  usedBy,
  isLoading,
}: {
  /** The agents using the model; undefined where they could not be read. */
  usedBy: number | undefined;
  /** Whether the agents are still being read. */
  isLoading: boolean;
}): RouteTabSpec[] {
  return MODEL_PAGE_TABS.map(tab =>
    tab.id === 'used-by'
      ? { ...tab, count: isLoading ? undefined : usedBy }
      : tab,
  );
}
