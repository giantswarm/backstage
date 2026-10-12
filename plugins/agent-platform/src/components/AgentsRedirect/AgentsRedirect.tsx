import { Navigate, useLocation, useParams } from 'react-router-dom';
import { NotFoundErrorPage, useRouteRef } from '@backstage/frontend-plugin-api';
import { agentsRouteRef } from '../../routes';

/**
 * `/agents` and everything below it, forwarded to the same place under the
 * Agents tab (`/agent-platform/agents/...`), query and hash kept: links,
 * bookmarks and docs that name the short path land on the list (or the agent,
 * or the create step) instead of a not-found page.
 *
 * Where the Agent Platform section is not enabled the tab's route is unbound,
 * and `/agents` stays the not-found page it would be without this redirect.
 */
export const AgentsRedirect = () => {
  const agentsLink = useRouteRef(agentsRouteRef);
  const rest = useParams()['*'] ?? '';
  const { search, hash } = useLocation();

  if (!agentsLink) {
    return <NotFoundErrorPage />;
  }
  const base = agentsLink().replace(/\/$/, '');
  const target = rest ? `${base}/${rest}` : base;
  return <Navigate to={`${target}${search}${hash}`} replace />;
};
