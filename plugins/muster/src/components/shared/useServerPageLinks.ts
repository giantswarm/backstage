import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  formatUsageWindowParam,
  USAGE_WINDOW_PARAM,
  type UsageWindowDays,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { withQuery } from '../../lib/installationLink';
import type { ConnectorPageTabPath } from '../ConnectorPage/connectorTabs';
import { connectorPageParams } from '../../lib/connectorAddress';
import {
  mcpOrganizationServerRouteRef,
  mcpOrganizationServerToolRouteRef,
  mcpServerRouteRef,
  mcpServerToolRouteRef,
} from '../../routes';

/**
 * A server page's tabs, by their path segment: the connector page's own list.
 * Tools is the index, so a link to it names no tab.
 */
export type ServerPageTab = ConnectorPageTabPath;

/**
 * A tool page's tabs below its own address, by their path segment. Overview
 * is the index, so a link to it names no tab.
 */
export type ToolPageTab = 'run' | 'usage';

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
   * `server` is the connector's page key (`lib/connectorAddress.ts`): its
   * name, or `-/<namespace>/<name>` for an organization's.
   *
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
   * A tool's page beneath its server -- its Overview, or another tab; `q`
   * and `effect` are the Tools search and filter it was opened from, which
   * the page's way back keeps, and `usageWindow` the window its Usage tab
   * covers.
   */
  tool: (
    server: string,
    tool: string,
    installation: string,
    options?: {
      tab?: ToolPageTab;
      usageWindow?: UsageWindowDays;
    } & ToolsListView,
  ) => string | undefined;
}

/**
 * Links to server and tool pages, on the installation that runs them: it is
 * part of the path (`<installation>/<server>`), so a shared link shows the
 * server where it was copied from, whatever the reader's scope. Undefined
 * while the routes are unbound, and without an installation — never a link
 * the reader's scope would silently resolve.
 */
/** A Usage tab's `?window=`: none for the default 30 days, or none given. */
function windowParam(days: UsageWindowDays | undefined): string | undefined {
  return days ? formatUsageWindowParam(days) : undefined;
}

export function useServerPageLinks(): ServerPageLinks {
  const serverRoute = useRouteRef(mcpServerRouteRef);
  const toolRoute = useRouteRef(mcpServerToolRouteRef);
  const orgServerRoute = useRouteRef(mcpOrganizationServerRouteRef);
  const orgToolRoute = useRouteRef(mcpOrganizationServerToolRouteRef);

  return useMemo(
    () => ({
      server: (server, installation, options = {}) => {
        if (!installation) {
          return undefined;
        }
        const params = connectorPageParams(server);
        const base =
          params.namespace === undefined
            ? serverRoute?.({ installation, server })
            : orgServerRoute?.({ installation, ...params });
        if (!base) {
          return undefined;
        }
        return withQuery(options.tab ? `${base}/${options.tab}` : base, {
          q: options.q,
          effect: options.effect?.join(','),
          [USAGE_WINDOW_PARAM]: windowParam(options.usageWindow),
        });
      },
      tool: (server, tool, installation, options = {}) => {
        if (!installation) {
          return undefined;
        }
        const params = connectorPageParams(server);
        const base =
          params.namespace === undefined
            ? toolRoute?.({ installation, server, tool })
            : orgToolRoute?.({ installation, ...params, tool });
        if (!base) {
          return undefined;
        }
        return withQuery(options.tab ? `${base}/${options.tab}` : base, {
          q: options.q,
          effect: options.effect?.join(','),
          [USAGE_WINDOW_PARAM]: windowParam(options.usageWindow),
        });
      },
    }),
    [serverRoute, toolRoute, orgServerRoute, orgToolRoute],
  );
}
