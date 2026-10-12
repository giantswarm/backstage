import type { RouteTabSpec } from '@giantswarm/backstage-plugin-ui-react';

/**
 * The agent page's tabs, per the prototype: the agent in plain words (with
 * its skills folded in), the reader's sessions with it, its tools and its
 * usage. Drawn by `ShellPage` as the page's own strip.
 *
 * Tools is there only for an agent with tools, that is one bound to the muster
 * gateway (see `hasGatewayTools`): the tab resolves the gateway toolset, and
 * an agent without the binding has nothing for it to show.
 */
export function agentTabs({ hasTools }: { hasTools: boolean }): RouteTabSpec[] {
  return [
    { id: 'overview', path: '', title: 'Overview' },
    { id: 'sessions', path: 'sessions', title: 'Sessions' },
    ...(hasTools ? [{ id: 'tools', path: 'tools', title: 'Tools' }] : []),
    { id: 'usage', path: 'usage', title: 'Usage' },
  ];
}
