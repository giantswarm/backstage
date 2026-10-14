import type { RouteTabSpec } from '@giantswarm/backstage-plugin-ui-react';

/**
 * A workflow page's tabs, each its own address under the page's. Overview is
 * the index, so the page's own address. Exported for telemetry, which reports
 * the tab as the page view's `view` and needs the closed set.
 */
export const WORKFLOW_PAGE_TABS: RouteTabSpec[] = [
  { id: 'overview', path: '', title: 'Overview' },
  { id: 'usage', path: 'usage', title: 'Usage' },
  { id: 'details', path: 'details', title: 'Details' },
];
