import type { RouteTabSpec } from '@giantswarm/backstage-plugin-ui-react';

/**
 * The agent page's tabs, per the prototype: the agent in plain words (with
 * its skills folded in), the reader's sessions with it, its tools and its
 * usage. Drawn by `ShellPage` as the page's own strip.
 *
 * Tools is there only for an agent with tools (`toolsetHasTools`): bound to
 * the muster gateway and not declaring `preset:none`. The tab resolves the
 * gateway toolset, and a chat-only agent has nothing for it to show.
 */
export function agentTabs({ hasTools }: { hasTools: boolean }): RouteTabSpec[] {
  return [
    { id: 'overview', path: '', title: 'Overview' },
    { id: 'sessions', path: 'sessions', title: 'Sessions' },
    ...(hasTools ? [{ id: 'tools', path: 'tools', title: 'Tools' }] : []),
    { id: 'usage', path: 'usage', title: 'Usage' },
  ];
}
