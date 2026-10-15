import { useMemo } from 'react';
import { useResources } from '@giantswarm/backstage-plugin-kubernetes-react';
import { MCPServer } from '@giantswarm/backstage-plugin-muster';

/** One connector as the palette lists it. */
export type PaletteConnector = {
  /**
   * The connector page's segment under the Connectors tab: the family name
   * for a server family, the CR name for a singular server.
   */
  page: string;
  /**
   * What the Connectors tab heads the page with: the
   * `ui.giantswarm.io/display-name` its CRs agree on, else {@link page}.
   */
  displayName: string;
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
    const namesByPage = new Map<string, Set<string>>();
    for (const server of resources) {
      const page = server.getFamily() ?? server.getName();
      const set = byPage.get(page) ?? new Set<string>();
      set.add(server.cluster);
      byPage.set(page, set);
      const names = namesByPage.get(page) ?? new Set<string>();
      const name = server.getDisplayNameAnnotation();
      if (name) {
        names.add(name);
      }
      namesByPage.set(page, names);
    }
    return [...byPage.entries()]
      .map(([page, clusters]) => {
        // CRs that disagree (one installation renamed it) name nothing, as
        // on the Connectors tab: the page keeps its own name.
        const names = namesByPage.get(page)!;
        return {
          page,
          displayName: names.size === 1 ? [...names][0] : page,
          installations: [...clusters].sort(),
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [resources]);

  return {
    rows,
    isLoading: installations.length > 0 && isLoading,
  };
}
