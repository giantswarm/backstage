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
   * What the Connectors tab heads the page with, by the muster plugin's
   * naming rule (`connectorDisplayNames`) over the CRs of every installation
   * listed: the display name its CRs agree on, unless another connector would
   * read the same, else {@link page}.
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
    const byKey = new Map<string, { page: string; installation: string }>();
    for (const server of resources) {
      const page = server.getFamily() ?? server.getName();
      byKey.set(`${server.cluster}/${page}`, {
        page,
        installation: server.cluster,
      });
    }
    const names = mcpServerDisplayNames(resources);
    return [...byKey.values()]
      .map(({ page, installation }) => ({
        page,
        displayName: names.get(page) ?? page,
        installation,
      }))
      .sort(
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
