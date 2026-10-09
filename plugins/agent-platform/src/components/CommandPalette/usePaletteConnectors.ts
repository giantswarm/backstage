import { useMemo } from 'react';
import { useResources } from '@giantswarm/backstage-plugin-kubernetes-react';
import { MCPServer } from '@giantswarm/backstage-plugin-muster';

/** One connector as the palette lists it. */
export type PaletteConnector = {
  /**
   * The connector page's segment under the Connectors tab: the family name
   * for a server family, the CR name for a singular server. Also the display
   * name — it is what the Connectors tab heads the page with.
   */
  page: string;
  /** The installations the connector is registered on, sorted. */
  installations: string[];
};

export type PaletteConnectors = {
  rows: PaletteConnector[];
  isLoading: boolean;
};

/**
 * The connectors across the given installations, read as MCPServer CRs
 * through the Backstage kubernetes proxy like {@link useMusterServers} — no
 * muster session needed, so the palette can search them without a sign-in
 * hop. A server family registered on several installations is one row, the
 * same way the Connectors tab shows one page for it.
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
    const byPage = new Map<string, Set<string>>();
    for (const server of resources) {
      const page = server.getFamily() ?? server.getName();
      const set = byPage.get(page) ?? new Set<string>();
      set.add(server.cluster);
      byPage.set(page, set);
    }
    return [...byPage.entries()]
      .map(([page, clusters]) => ({
        page,
        installations: [...clusters].sort(),
      }))
      .sort((a, b) => a.page.localeCompare(b.page));
  }, [resources]);

  return {
    rows,
    isLoading: installations.length > 0 && isLoading,
  };
}
