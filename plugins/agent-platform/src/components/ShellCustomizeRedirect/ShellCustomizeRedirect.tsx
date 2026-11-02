import { agentsRouteRef, modelsRouteRef, skillsRouteRef } from '../../routes';
import { RouteRefRedirect } from '../RouteRefRedirect';

export type ShellCustomizeRedirectProps = {
  tab: 'agents' | 'skills' | 'models';
  /**
   * Whether the query string comes along (the installation scope). The skill
   * pages' redirects never carried it: skills are not per-installation.
   */
  keepSearch?: boolean;
};

const TAB_ROUTES = {
  agents: agentsRouteRef,
  skills: skillsRouteRef,
  models: modelsRouteRef,
};

/**
 * Sends an address under one of this plugin's Customize tabs that names no
 * page to the nearest valid parent, the tab's list. The tab is this plugin's
 * own route (the list at its bare path), so it resolves wherever the tab's
 * pages do.
 */
export function ShellCustomizeRedirect({
  tab,
  keepSearch = true,
}: ShellCustomizeRedirectProps) {
  return (
    <RouteRefRedirect routeRef={TAB_ROUTES[tab]} keepSearch={keepSearch} />
  );
}
