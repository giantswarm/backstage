import type { RouteTabSpec } from '@giantswarm/backstage-plugin-ui-react';

/**
 * A connector tool's page tabs, each its own address under the page's, in
 * the workflow page's order. Overview is the index, so the page's own
 * address. Exported for telemetry, which reports the tab as the page view's
 * `view` and needs the closed set.
 */
export const TOOL_PAGE_TABS: RouteTabSpec[] = [
  { id: 'overview', path: '', title: 'Overview' },
  { id: 'run', path: 'run', title: 'Run it' },
  { id: 'usage', path: 'usage', title: 'Usage' },
];
