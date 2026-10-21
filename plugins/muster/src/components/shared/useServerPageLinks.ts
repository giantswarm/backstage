import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  formatUsageWindowParam,
  USAGE_WINDOW_PARAM,
  type UsageWindowDays,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { withQuery } from '../../lib/installationLink';
import type { ConnectorPageTabPath } from '../ConnectorPage/connectorTabs';
import { mcpServerRouteRef, mcpServerToolRouteRef } from '../../routes';

/**
 * A server page's tabs, by their path segment: the connector page's own list.
 * Tools is the index, so a link to it names no tab.
 */
export type ServerPageTab = ConnectorPageTabPath;

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
   * search and `effect` its "What it does" filter, and `usageWindow` the
   * window its Usage tab covers (the default 30 days names none).
   */
  server: (
    server: string,
    installation: string,
    options?: {
      tab?: ServerPageTab;
      usageWindow?: UsageWindowDays;
    } & ToolsListView,
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
 * Links to server and tool pages, on the installation that runs them: it is
 * part of the path (`<installation>/<server>`), so a shared link shows the
 * server where it was copied from, whatever the reader's scope. Undefined
 * while the routes are unbound, and without an installation — never a link
 * the reader's scope would silently resolve.
 */
export function useServerPageLinks(): ServerPageLinks {
  const serverRoute = useRouteRef(mcpServerRouteRef);
  const toolRoute = useRouteRef(mcpServerToolRouteRef);

  return useMemo(
    () => ({
      server: (server, installation, options = {}) => {
        if (!serverRoute || !installation) {
          return undefined;
        }
        const base = serverRoute({ installation, server });
        return withQuery(options.tab ? `${base}/${options.tab}` : base, {
          q: options.q,
          effect: options.effect?.join(','),
          [USAGE_WINDOW_PARAM]: options.usageWindow
            ? formatUsageWindowParam(options.usageWindow)
            : undefined,
        });
      },
      tool: (server, tool, installation, options = {}) =>
        toolRoute && installation
          ? withQuery(toolRoute({ installation, server, tool }), {
              q: options.q,
              effect: options.effect?.join(','),
            })
          : undefined,
    }),
    [serverRoute, toolRoute],
  );
}
