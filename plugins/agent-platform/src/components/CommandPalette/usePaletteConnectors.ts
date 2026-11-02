import { useMemo } from 'react';
import { useResources } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  MCPServer,
  mcpServerDisplayNames,
} from '@giantswarm/backstage-plugin-muster';

/** One connector as the palette lists it. */
export type PaletteConnector = {
  /**
   * The connector page's segment under the Connectors tab: the family name
   * for a server family, the CR name for a singular server.
   */
  page: string;
  /**
   * What the Connectors tab heads the page with on {@link installation}, by
   * the muster plugin's naming rule (`mcpServerDisplayNames`) over that
   * installation's CRs: the display name its CRs agree on, unless another
   * connector there would read the same, else {@link page}.
   */
  displayName: string;
  /** The installation the connector is registered on. */
  installation: string;
};

export type PaletteConnectors = {
  rows: PaletteConnector[];
  isLoading: boolean;
};

/**
 * The connectors across the given installations, read as MCPServer CRs
 * through the Backstage kubernetes proxy like {@link useMusterServers} — no
 * muster session needed, so the palette can search them without a sign-in
 * hop. One row per connector and installation, like agents, models and
 * workflows: a server family is one row on each installation it is
 * registered on, never one per family instance.
 */
export function usePaletteConnectors(
  installations: string[],
): PaletteConnectors {
  const { resources, isLoading } = useResources(
    installations,
    MCPServer,
    {},
    { enabled: installations.length > 0 },
  );

  const rows = useMemo(() => {
    // Named per installation, as each installation's Connectors tab names
    // them: the naming rule reads one installation's CRs.
    const byInstallation = new Map<string, MCPServer[]>();
    for (const server of resources) {
      const servers = byInstallation.get(server.cluster) ?? [];
      servers.push(server);
      byInstallation.set(server.cluster, servers);
    }
    const list: PaletteConnector[] = [];
    for (const [installation, servers] of byInstallation) {
      const names = mcpServerDisplayNames(servers);
      const pages = new Set(
        servers.map(server => server.getFamily() ?? server.getName()),
      );
      for (const page of pages) {
        list.push({
          page,
          displayName: names.get(page) ?? page,
          installation,
        });
      }
    }
    return list.sort(
      (a, b) =>
        a.displayName.localeCompare(b.displayName) ||
        a.installation.localeCompare(b.installation),
    );
  }, [resources]);

  return {
    rows,
    isLoading: installations.length > 0 && isLoading,
  };
}
