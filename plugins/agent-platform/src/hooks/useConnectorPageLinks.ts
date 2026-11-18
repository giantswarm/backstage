import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  connectorPageHref,
  connectorToolPageHref,
} from '@giantswarm/backstage-plugin-muster';
import {
  musterOrganizationServerExternalRouteRef,
  musterOrganizationServerToolExternalRouteRef,
  musterServerExternalRouteRef,
  musterServerToolExternalRouteRef,
} from '../routes';

export interface ConnectorPageLinks {
  /** Whether muster's connector pages are routed (its plugin is enabled). */
  routed: boolean;
  /**
   * A connector's page by its page key (muster's `connectorPageHref`: its
   * name, or `-/<namespace>/<name>` for an organization's), in muster's
   * `useServerPageLinks` argument order.
   */
  server: (server: string, installation: string) => string | undefined;
  /** A tool's page beneath the connector of that page key. */
  tool: (
    server: string,
    tool: string,
    installation: string,
  ) => string | undefined;
}

/**
 * Links to muster's connector and tool pages through agent-platform's
 * external route refs, built by muster's own rule (`connectorPageHref`,
 * `connectorToolPageHref`). Undefined while the muster plugin is disabled
 * (its routes unbound), or without an installation.
 */
export function useConnectorPageLinks(): ConnectorPageLinks {
  const serverRoute = useRouteRef(musterServerExternalRouteRef);
  const toolRoute = useRouteRef(musterServerToolExternalRouteRef);
  const orgServerRoute = useRouteRef(musterOrganizationServerExternalRouteRef);
  const orgToolRoute = useRouteRef(
    musterOrganizationServerToolExternalRouteRef,
  );
  return useMemo(
    () => ({
      routed: Boolean(serverRoute && orgServerRoute),
      server: (server, installation) =>
        connectorPageHref(
          { server: serverRoute, organizationServer: orgServerRoute },
          server,
          installation,
        ),
      tool: (server, tool, installation) =>
        connectorToolPageHref(
          { tool: toolRoute, organizationTool: orgToolRoute },
          server,
          tool,
          installation,
        ),
    }),
    [serverRoute, toolRoute, orgServerRoute, orgToolRoute],
  );
}
