import { Navigate, useLocation } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import { customizeExternalRouteRef } from '../../routes';

export type CustomizeTabRedirectProps = {
  /** The Customize screen's tab that shows this list inside the shell. */
  tab: 'connectors' | 'workflows';
};

/**
 * Sends a muster list the shell shows on its Customize screen there, keeping
 * the query string (the installation scope) — the agent-platform plugin's
 * `ShellCustomizeRedirect` for its agents and models lists. Renders nothing
 * where the app binds no Customize page (it is mounted wherever these routes
 * are, so only a deployment that disables it explicitly gets here).
 */
export function CustomizeTabRedirect({ tab }: CustomizeTabRedirectProps) {
  const { search } = useLocation();
  const customizeRoute = useRouteRef(customizeExternalRouteRef);
  const customize = customizeRoute?.();
  if (!customize) {
    return null;
  }
  return <Navigate to={{ pathname: `${customize}/${tab}`, search }} replace />;
}
