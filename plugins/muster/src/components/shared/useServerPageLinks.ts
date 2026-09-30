import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { mcpServerRouteRef, mcpServerToolRouteRef } from '../../routes';

/** A server page's tabs, by their path segment. Overview is the index. */
export type ServerPageTab = 'tools' | 'resources' | 'prompts' | 'instances';

function withQuery(path: string, query: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export interface ServerPageLinks {
  /** A server page (or one of its tabs); `q` pre-fills the Tools filter. */
  server: (
    server: string,
    installation: string | undefined,
    options?: { tab?: ServerPageTab; q?: string },
  ) => string | undefined;
  /** A tool's page beneath its server. */
  tool: (
    server: string,
    tool: string,
    installation: string | undefined,
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
        return withQuery(options.tab ? `${base}/${options.tab}` : base, {
          installation,
          q: options.q,
        });
      },
      tool: (server, tool, installation) =>
        toolRoute
          ? withQuery(toolRoute({ server, tool }), { installation })
          : undefined,
    }),
    [serverRoute, toolRoute],
  );
}
