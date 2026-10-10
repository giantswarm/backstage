import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import { customizeExternalRouteRef } from '../../routes';

export type CustomizeTabRedirectProps = {
  /** The Customize screen's tab that shows this list inside the shell. */
  tab: 'connectors' | 'workflows';
  /**
   * What renders when the app binds no Customize page: the classic list, so
   * the address keeps showing something rather than nothing.
   */
  fallback: ReactNode;
};

/**
 * Sends a muster list the shell shows on its Customize screen there, keeping
 * the query string (the installation scope) — the agent-platform plugin's
 * `ShellCustomizeRedirect` for its agents and models lists. Inside the shell
 * the classic list pages (the NamespacePicker, "Create workflow") must not be
 * reachable by URL: the Customize tabs are global and read-only where D4/D11
 * say so.
 */
export function CustomizeTabRedirect({
  tab,
  fallback,
}: CustomizeTabRedirectProps) {
  const { search } = useLocation();
  const customizeRoute = useRouteRef(customizeExternalRouteRef);
  const customize = customizeRoute?.();
  if (!customize) {
    return <>{fallback}</>;
  }
  return <Navigate to={{ pathname: `${customize}/${tab}`, search }} replace />;
}
