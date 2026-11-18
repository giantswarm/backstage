import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { connectorPageParams } from '@giantswarm/backstage-plugin-muster';
import {
  musterOrganizationServerExternalRouteRef,
  musterOrganizationServerToolExternalRouteRef,
  musterServerExternalRouteRef,
  musterServerToolExternalRouteRef,
} from '../routes';

export interface ConnectorPageLinks {
  /**
   * A connector's page by its page key (muster's `lib/connectorAddress.ts`:
   * its name, or `-/<namespace>/<name>` for an organization's).
   */
  server: (installation: string, server: string) => string | undefined;
  /** A tool's page beneath the connector of that page key. */
  tool: (
    installation: string,
    server: string,
    tool: string,
  ) => string | undefined;
}

/**
 * Links to muster's connector and tool pages, built by muster's own rule
 * (`connectorPageParams`), so an organization's connector opens at its own
 * `-/<namespace>/<name>` address. Undefined while the muster plugin is
 * disabled (its routes unbound), or without an installation.
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
      server: (installation, server) => {
        if (!installation) {
          return undefined;
        }
        const params = connectorPageParams(server);
        return params.namespace === undefined
          ? serverRoute?.({ installation, server })
          : orgServerRoute?.({ installation, ...params });
      },
      tool: (installation, server, tool) => {
        if (!installation) {
          return undefined;
        }
        const params = connectorPageParams(server);
        return params.namespace === undefined
          ? toolRoute?.({ installation, server, tool })
          : orgToolRoute?.({ installation, ...params, tool });
      },
    }),
    [serverRoute, toolRoute, orgServerRoute, orgToolRoute],
  );
}
