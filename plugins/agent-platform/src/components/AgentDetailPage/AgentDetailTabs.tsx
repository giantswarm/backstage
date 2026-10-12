import type { RouteTabSpec } from '@giantswarm/backstage-plugin-ui-react';

/**
 * The agent page's tabs, per the prototype: the agent in
 * plain words (with its tools and skills folded in), the reader's sessions
 * with it, and its usage. Drawn by `ShellPage` as the page's own strip.
 */
export const SHELL_AGENT_TABS: RouteTabSpec[] = [
  { id: 'overview', path: '', title: 'Overview' },
  { id: 'sessions', path: 'sessions', title: 'Sessions' },
  { id: 'usage', path: 'usage', title: 'Usage' },
];
