import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import { mcpServersRouteRef } from '../../routes';

/**
 * The old "MCP Servers" address, sent on to the tab's new one with its path
 * and parameters, so every shared link keeps working:
 * `/agent-platform/mcp-servers/kubernetes?installation=…` →
 * `/agent-platform/connectors/kubernetes?installation=…` (the `/plans` →
 * `/hive` pattern).
 */
export function ConnectorsRedirect() {
  const link = useRouteRef(mcpServersRouteRef);
  const splat = useParams()['*'] ?? '';
  const { search, hash } = useLocation();
  const base = link?.();
  if (!base) {
    return null;
  }
  const to = `${[base, splat].filter(Boolean).join('/')}${search}${hash}`;
  return <Navigate to={to} replace />;
}
