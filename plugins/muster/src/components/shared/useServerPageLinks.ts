import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { withInstallationQuery } from '../../lib/installationLink';
import { mcpServerRouteRef, mcpServerToolRouteRef } from '../../routes';

/**
 * A server page's tabs, by their path segment. Tools is the index, so a link
 * to it names no tab.
 */
export type ServerPageTab = 'instances' | 'resources' | 'prompts' | 'details';

/**
 * The Tools tab's search and "What it does" filter, as an address carries
 * them: `?q=` and `?effect=reads,changes`.
 */
export interface ToolsListView {
  q?: string;
  effect?: readonly string[];
}

export interface ServerPageLinks {
  /**
   * A server page -- its Tools, or another tab; `q` pre-fills the Tools
   * search and `effect` its "What it does" filter.
   */
  server: (
    server: string,
    installation: string,
    options?: { tab?: ServerPageTab } & ToolsListView,
  ) => string | undefined;
  /**
   * A tool's page beneath its server; `q` and `effect` are the Tools search
   * and filter it was opened from, which the page's way back keeps.
   */
  tool: (
    server: string,
    tool: string,
    installation: string,
    options?: ToolsListView,
  ) => string | undefined;
}

/**
 * Links to server and tool pages. Every one carries `?installation=`: the
 * section's scope reads it before the stored choice, so a shared link shows the
 * server on the installation it was copied from. Undefined while the routes are
 * unbound.
 */
export function useServerPageLinks(): ServerPageLinks {
  const serverRoute = useRouteRef(mcpServerRouteRef);
  const toolRoute = useRouteRef(mcpServerToolRouteRef);

  return useMemo(
    () => ({
      server: (server, installation, options = {}) => {
        if (!serverRoute) {
          return undefined;
        }
        const base = serverRoute({ server });
        return withInstallationQuery(
          options.tab ? `${base}/${options.tab}` : base,
          installation,
          {
            q: options.q,
            effect: options.effect?.join(','),
          },
        );
      },
      tool: (server, tool, installation, options = {}) =>
        toolRoute
          ? withInstallationQuery(toolRoute({ server, tool }), installation, {
              q: options.q,
              effect: options.effect?.join(','),
            })
          : undefined,
    }),
    [serverRoute, toolRoute],
  );
}
