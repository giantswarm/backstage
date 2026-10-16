import { Navigate, useLocation } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import { agentsRouteRef, modelsRouteRef, skillsRouteRef } from '../../routes';

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
 * page to the nearest valid parent, the tab's list, keeping the query string
 * (the installation scope). The tab is this plugin's own route (the list at
 * its bare path), so it resolves wherever the tab's pages do.
 */
export function ShellCustomizeRedirect({
  tab,
  keepSearch = true,
}: ShellCustomizeRedirectProps) {
  const { search } = useLocation();
  const list = useRouteRef(TAB_ROUTES[tab]);
  if (!list) {
    return null;
  }
  return (
    <Navigate
      to={{
        pathname: list(),
        search: keepSearch ? search : undefined,
      }}
      replace
    />
  );
}
