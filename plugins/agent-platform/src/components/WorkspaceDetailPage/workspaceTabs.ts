import type { RouteTabSpec } from '@giantswarm/backstage-plugin-ui-react';

/**
 * A workspace page's tabs, each its own address under the page's.
 * Repositories is the index, so the page's own address. Exported for
 * telemetry, which reports the tab as the page view's `view` and needs the
 * closed set.
 */
export const WORKSPACE_PAGE_TABS: RouteTabSpec[] = [
  { id: 'repositories', path: '', title: 'Repositories' },
  { id: 'sessions', path: 'sessions', title: 'Sessions' },
  { id: 'details', path: 'details', title: 'Details' },
];

/** The tabs with the repositories' and Sessions' counts. */
export function workspacePageTabs(counts: {
  repositories: number;
  sessions: number;
}): RouteTabSpec[] {
  return WORKSPACE_PAGE_TABS.map(tab => {
    if (tab.id === 'repositories') {
      return { ...tab, count: counts.repositories };
    }
    return tab.id === 'sessions' ? { ...tab, count: counts.sessions } : tab;
  });
}
