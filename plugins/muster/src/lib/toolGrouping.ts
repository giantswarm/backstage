import { ToolSummary } from '../apis';

/**
 * What the tool browser needs to know about one aggregated MCP server to place
 * its tools under the right management-cluster section. Derived from the
 * MCPServer CRs the active installation exposes (see MCPServer.getToolNamePrefix).
 */
export interface ServerPrefixInfo {
  /** The `x_<segment>` prefix muster gives this server's tools. */
  prefix: string;
  serverName: string;
  managementCluster?: string;
  family?: string;
}

export type ToolGroupKind = 'core' | 'workflow' | 'server' | 'other';

export interface ToolGroup {
  /** Stable key, also the section label. */
  key: string;
  kind: ToolGroupKind;
  /** Secondary label (e.g. the family/server) shown under a server section. */
  subtitle?: string;
  tools: ToolSummary[];
}

/**
 * Resolve the server a tool belongs to by longest-matching tool-name prefix.
 * Prefixes can share a leading segment, so the longest match wins (e.g.
 * `x_kubernetes_gazelle_*` beats `x_kubernetes_*`).
 */
function matchServer(
  name: string,
  servers: ServerPrefixInfo[],
): ServerPrefixInfo | undefined {
  let best: ServerPrefixInfo | undefined;
  for (const server of servers) {
    if (
      (name === server.prefix || name.startsWith(`${server.prefix}_`)) &&
      (!best || server.prefix.length > best.prefix.length)
    ) {
      best = server;
    }
  }
  return best;
}

/**
 * Group a tool catalogue into the explorer's sections: Core, Workflows, and one
 * section per management cluster (resolved from the MCPServer CRs). Tools whose
 * `x_<segment>` prefix can't be resolved to a CR fall back to a per-segment
 * "Server: <segment>" section so nothing is hidden.
 *
 * ponytail: management-cluster resolution depends on the CR tool-name prefixes
 * being unique; when CRDs aren't readable the server sections degrade to the
 * raw name segment. Upgrade path: aggregator-provided server metadata per tool.
 */
export function groupTools(
  tools: ToolSummary[],
  servers: ServerPrefixInfo[],
): ToolGroup[] {
  const groups = new Map<string, ToolGroup>();

  const bucket = (
    key: string,
    kind: ToolGroupKind,
    subtitle?: string,
  ): ToolGroup => {
    const existing = groups.get(key);
    if (existing) {
      return existing;
    }
    const created: ToolGroup = { key, kind, subtitle, tools: [] };
    groups.set(key, created);
    return created;
  };

  for (const tool of tools) {
    const name = tool.name;
    if (name.startsWith('core_')) {
      bucket('Core', 'core').tools.push(tool);
      continue;
    }
    if (name.startsWith('workflow_')) {
      bucket('Workflows', 'workflow').tools.push(tool);
      continue;
    }
    if (name.startsWith('x_')) {
      const server = matchServer(name, servers);
      if (server?.managementCluster) {
        bucket(server.managementCluster, 'server', server.family).tools.push(
          tool,
        );
        continue;
      }
      const segment = server?.family ?? name.slice(2).split('_')[0];
      bucket(`Server: ${segment || 'unknown'}`, 'server').tools.push(tool);
      continue;
    }
    bucket('Other', 'other').tools.push(tool);
  }

  const rank = (group: ToolGroup) => {
    if (group.kind === 'core') return 0;
    if (group.kind === 'workflow') return 1;
    if (group.kind === 'other') return 3;
    return 2;
  };

  return [...groups.values()].sort((a, b) => {
    const r = rank(a) - rank(b);
    return r !== 0 ? r : a.key.localeCompare(b.key);
  });
}
