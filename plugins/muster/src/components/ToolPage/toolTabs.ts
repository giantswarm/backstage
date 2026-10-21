import type { RouteTabSpec } from '@giantswarm/backstage-plugin-ui-react';
import { MUSTER_SERVER_KEY } from '../../lib/serverGrouping';

/**
 * A connector tool's page tabs, each its own address under the page's, in
 * the workflow page's order. Overview is the index, so the page's own
 * address.
 */
export const TOOL_PAGE_TABS: RouteTabSpec[] = [
  { id: 'overview', path: '', title: 'Overview' },
  { id: 'run', path: 'run', title: 'Run it' },
  { id: 'usage', path: 'usage', title: 'Usage' },
];

/**
 * The tabs of a tool's page beneath the connector the address names
 * (`server`, the connector page's key). muster's own tools are dispatched to
 * no connector, so no metric counts them: they have no Usage tab, as
 * muster's own page has none. Told by the address alone, so the page's strip
 * never changes once the connectors are read, and exported for telemetry,
 * which reports the tab as the page view's `view` and needs the closed set.
 */
export function toolPageTabs(server: string): RouteTabSpec[] {
  return server === MUSTER_SERVER_KEY
    ? TOOL_PAGE_TABS.filter(tab => tab.id !== 'usage')
    : TOOL_PAGE_TABS;
}
