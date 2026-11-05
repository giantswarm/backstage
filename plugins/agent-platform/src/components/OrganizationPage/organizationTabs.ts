import type { RouteTabSpec } from '@giantswarm/backstage-plugin-ui-react';

/**
 * An organization page's tabs, each its own address under the page's.
 * Members is the index, so the page's own address. Connectors and Egress are
 * tabs here; the plan's alternative (Q29) puts them under Customize, scoped
 * by organization. Exported for telemetry, which reports the tab as the page
 * view's `view` and needs the closed set.
 */
export const ORGANIZATION_PAGE_TABS: RouteTabSpec[] = [
  { id: 'members', path: '', title: 'Members' },
  { id: 'models', path: 'models', title: 'Models' },
  { id: 'connectors', path: 'connectors', title: 'Connectors' },
  { id: 'egress', path: 'egress', title: 'Egress' },
];
