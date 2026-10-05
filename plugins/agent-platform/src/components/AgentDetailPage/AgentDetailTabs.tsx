import { RouteTabs, RouteTabSpec } from '@giantswarm/backstage-plugin-ui-react';

/**
 * The tabs, in reading order: what the agent is, what it can reach, what it
 * knows, what it has been used for. Overview is the index — its path is empty —
 * so the three-segment URL every link in the portal already points at keeps
 * rendering the agent without a redirect.
 */
const TABS: RouteTabSpec[] = [
  { id: 'overview', path: '', title: 'Overview' },
  { id: 'tools', path: 'tools', title: 'Tools' },
  { id: 'skills', path: 'skills', title: 'Skills' },
  { id: 'sessions', path: 'sessions', title: 'Sessions' },
];

/**
 * The detail page's tab strip, its content driven by the page's router rather
 * than by TabPanels -- the same shape as the second-level tab rows in
 * ModelsRouter and UsageRouter.
 *
 * Unlike those, this strip needs no `px` of its own: it renders inside the page's
 * `<Content>`, which already applies the gutter they have to reproduce by hand.
 */
export function AgentDetailTabs() {
  return <RouteTabs tabs={TABS} />;
}
