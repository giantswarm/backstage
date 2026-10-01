import { ToolSummary } from '../apis';
import type { MCPServer } from './k8s';
import type { ServerPageRow } from './serverGrouping';

/**
 * One tool-name prefix an aggregated MCP server's tools are exposed under,
 * and the server it belongs to. Derived from the MCPServer CRs the active
 * installation exposes (see `serverPrefixInfos`, MCPServer.getToolNamePrefix).
 */
export interface ServerPrefixInfo {
  /** The `x_<segment>` prefix muster gives this server's tools. */
  prefix: string;
  serverName: string;
  family?: string;
}

/**
 * Resolve every server whose tool-name prefix matches `name`, keeping only the
 * longest-matching prefixes. Prefixes can share a leading segment (e.g.
 * `x_kubernetes_gazelle_*` beats `x_kubernetes_*`), so the longest match wins.
 * A federated family dedupes many same-prefix servers (one per management
 * cluster) into a single tool, so several servers can legitimately tie at the
 * longest match -- the caller treats that as a shared family.
 */
export function matchServers(
  name: string,
  servers: ServerPrefixInfo[],
): ServerPrefixInfo[] {
  let bestLen = -1;
  let matches: ServerPrefixInfo[] = [];
  for (const server of servers) {
    if (name === server.prefix || name.startsWith(`${server.prefix}_`)) {
      if (server.prefix.length > bestLen) {
        bestLen = server.prefix.length;
        matches = [server];
      } else if (server.prefix.length === bestLen) {
        matches.push(server);
      }
    }
  }
  return matches;
}

/**
 * Every tool-name prefix the installation's servers are exposed under. A family
 * member contributes two: the family's (`x_<family>`, the tools muster groups
 * under one name) and its own `x_<toolPrefix | name>`, which muster falls back
 * to for a tool the members do not agree on (diverging descriptions, an
 * instance argument clashing with an input property) or for the whole family
 * when the members' instance arguments differ.
 */
export function serverPrefixInfos(servers: MCPServer[]): ServerPrefixInfo[] {
  return servers.flatMap(server => {
    const info = {
      serverName: server.getName(),
      family: server.getFamily(),
    };
    const own = `x_${server.getToolPrefix() ?? server.getName()}`;
    const prefix = server.getToolNamePrefix();
    return own === prefix
      ? [{ ...info, prefix }]
      : [
          { ...info, prefix },
          { ...info, prefix: own },
        ];
  });
}

/**
 * The tools a server page lists: muster's own (`core_*`, `workflow_*`) for
 * muster, otherwise the tools whose longest-matching prefix belongs to the row
 * -- so `x_foo` never claims the tools of a server exposed as `x_foo_bar`.
 */
export function toolsForRow(
  tools: ToolSummary[],
  row: ServerPageRow,
  servers: ServerPrefixInfo[],
): ToolSummary[] {
  if (row.kind === 'core') {
    return tools.filter(
      t => t.name.startsWith('core_') || t.name.startsWith('workflow_'),
    );
  }
  const owns = (info: ServerPrefixInfo) =>
    row.kind === 'family'
      ? info.family === row.family
      : !info.family && info.serverName === row.server.getName();
  return tools.filter(
    t => t.name.startsWith('x_') && matchServers(t.name, servers).some(owns),
  );
}

/**
 * A tool's name without the prefix of the server offering it, for display:
 * `x_kubernetes_get_pods` reads `get_pods` on the kubernetes page. The prefix
 * is the longest one of `servers` the name matches; muster's own tools lose
 * `core_`. A name nothing matches is returned whole.
 */
export function shortToolName(
  name: string,
  servers: ServerPrefixInfo[],
): string {
  if (name.startsWith('core_')) {
    return name.slice('core_'.length);
  }
  const prefix = matchServers(name, servers)[0]?.prefix;
  return prefix && name.startsWith(`${prefix}_`)
    ? name.slice(prefix.length + 1)
    : name;
}

/**
 * The list key of the row a tool belongs to: `family:<name>`, `server:<name>`
 * or `core` -- kind-qualified, because a family and a singular server may
 * share a name.
 */
export type ServerListKey = string;

/** The list key of a server page row. */
export function serverListKey(row: ServerPageRow): ServerListKey {
  switch (row.kind) {
    case 'family':
      return `family:${row.family}`;
    case 'server':
      return `server:${row.server.getName()}`;
    default:
      return 'core';
  }
}

/**
 * The installation's catalogue split by the row each tool belongs to, keyed
 * by {@link serverListKey}: muster's own (`core_*`, `workflow_*`) under
 * `core`, every other tool under the row its longest-matching prefix belongs
 * to -- the same attribution as {@link toolsForRow}, made once per tool rather
 * than once per row and tool. A tool no server's prefix matches is left out.
 */
export function toolsByServerKey(
  tools: ToolSummary[],
  servers: ServerPrefixInfo[],
): Map<ServerListKey, ToolSummary[]> {
  const byKey = new Map<ServerListKey, ToolSummary[]>();
  const add = (key: ServerListKey, tool: ToolSummary) => {
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.push(tool);
    } else {
      byKey.set(key, [tool]);
    }
  };
  for (const tool of tools) {
    if (tool.name.startsWith('core_') || tool.name.startsWith('workflow_')) {
      add('core', tool);
    } else if (tool.name.startsWith('x_')) {
      // A family and a singular server of the same name tie on the prefix;
      // the family's page lists the tool (see serverPageOfTool).
      const matches = matchServers(tool.name, servers);
      const owner = matches.find(match => match.family) ?? matches[0];
      if (owner) {
        add(
          owner.family
            ? `family:${owner.family}`
            : `server:${owner.serverName}`,
          tool,
        );
      }
    }
  }
  return byKey;
}

/**
 * The server page a tool is found on: the `<server>` segment of
 * `/agent-platform/mcp-servers/<server>/tools/<tool>`. By the rule the pages
 * themselves list tools with -- muster's own (`core_*`, `workflow_*`) on
 * `muster`, any other tool on the row its longest-matching prefix belongs to
 * (a family, also for a tool muster exposes per instance, or a singular
 * server) -- so a link built from it opens a page that shows the tool.
 * Undefined when no server's prefix matches, or when the tool's server is a
 * singular one whose page a family of the same name takes.
 */
export function serverPageOfTool(
  toolName: string,
  servers: MCPServer[],
): string | undefined {
  if (toolName.startsWith('core_') || toolName.startsWith('workflow_')) {
    return 'muster';
  }
  // A family and a singular server of the same name share the prefix and
  // tie; the family's page is the one that lists the tool.
  const matches = matchServers(toolName, serverPrefixInfos(servers));
  const owner = matches.find(match => match.family) ?? matches[0];
  if (!owner) {
    return undefined;
  }
  if (owner.family) {
    return owner.family;
  }
  const shadowed =
    owner.serverName === 'muster' ||
    servers.some(server => server.getFamily() === owner.serverName);
  return shadowed ? undefined : owner.serverName;
}
