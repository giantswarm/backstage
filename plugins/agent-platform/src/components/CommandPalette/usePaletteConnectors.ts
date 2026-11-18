import { useMemo } from 'react';
import { useResources } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  MCPServer,
  serverListRows,
  useMusterKeyedServers,
} from '@giantswarm/backstage-plugin-muster';

/** One connector as the palette lists it. */
export type PaletteConnector = {
  /**
   * Unique among the installation's connectors: the Connectors list's row key
   * (muster's key for a server, `<namespace>/<name>` for an organization's).
   */
  key: string;
  /**
   * The connector page's key under the Connectors tab (muster's
   * `connectorPageParams`): the family name for a server family, the CR name
   * for muster's own singular server, `-/<namespace>/<name>` for an
   * organization's. Absent where the Connectors list opens no page either:
   * muster's own server whose name a family takes.
   */
  page?: string;
  /**
   * What the Connectors tab calls the connector on {@link installation}, by
   * the muster plugin's naming rule over that installation's CRs.
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
  const { resources: crs, isLoading } = useResources(
    installations,
    MCPServer,
    {},
    { enabled: installations.length > 0 },
  );
  // Each with muster's key for it, as the Connectors list reads them.
  const resources = useMusterKeyedServers(crs);

  const rows = useMemo(() => {
    // Listed per installation, as each installation's Connectors tab lists
    // them: one row per family and per singular server, by the same rule.
    const byInstallation = new Map<string, MCPServer[]>();
    for (const server of resources) {
      const servers = byInstallation.get(server.cluster) ?? [];
      servers.push(server);
      byInstallation.set(server.cluster, servers);
    }
    const list: PaletteConnector[] = [];
    for (const [installation, servers] of byInstallation) {
      for (const row of serverListRows(servers, undefined)) {
        if (row.row.kind === 'core') {
          continue;
        }
        list.push({
          key: row.key,
          ...(row.shadowed ? {} : { page: row.id }),
          displayName: row.displayName,
          installation,
        });
      }
    }
    return list.sort(
      (a, b) =>
        a.displayName.localeCompare(b.displayName) ||
        a.installation.localeCompare(b.installation) ||
        a.key.localeCompare(b.key),
    );
  }, [resources]);

  return {
    rows,
    isLoading: installations.length > 0 && isLoading,
  };
}
