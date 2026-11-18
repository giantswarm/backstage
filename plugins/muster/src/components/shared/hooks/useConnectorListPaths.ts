import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { customizeExternalRouteRef, mcpServersRouteRef } from '../../../routes';

export interface ConnectorListPaths {
  customize?: string;
  /** The Connectors tab's list, which lists every connector. */
  connectors?: string;
}

/**
 * The Customize screen and its Connectors tab. The
 * tab is this plugin's own route (the list at its bare path), so it resolves
 * wherever the connector pages do; the Customize screen resolves where the
 * app binds it. Each is undefined where it does not resolve, so a caller
 * renders plain text instead of a link to a 404.
 */
export function useConnectorListPaths(): ConnectorListPaths {
  const customizeRoute = useRouteRef(customizeExternalRouteRef);
  const serversRoute = useRouteRef(mcpServersRouteRef);
  const customize = customizeRoute?.();
  const connectors = serversRoute?.();
  return useMemo(() => ({ customize, connectors }), [customize, connectors]);
}
