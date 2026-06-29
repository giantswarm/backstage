import { ToolSummary } from '../apis';

/**
 * What the tool browser needs to know about one aggregated MCP server to place
 * its tools under the right section. Derived from the MCPServer CRs the active
 * installation exposes (see MCPServer.getToolNamePrefix).
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

/** Capitalise a family segment for a section label ("kubernetes" -> "Kubernetes"). */
function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** The bare `<segment>` of an `x_<segment>_...` tool name. */
function segmentOf(name: string): string {
  return name.slice(2).split('_')[0] || 'unknown';
}

/**
 * Resolve every server whose tool-name prefix matches `name`, keeping only the
 * longest-matching prefixes. Prefixes can share a leading segment (e.g.
 * `x_kubernetes_gazelle_*` beats `x_kubernetes_*`), so the longest match wins.
 * A federated family dedupes many same-prefix servers (one per management
 * cluster) into a single tool, so several servers can legitimately tie at the
 * longest match -- the caller treats that as a shared family.
 */
function matchServers(
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

interface GroupAcc {
  group: ToolGroup;
  /** Families seen in this bucket, so the subtitle reflects the set, not the first. */
  families: Set<string>;
  /** Management clusters a fleet bucket federates over. */
  clusters: Set<string>;
  fleet: boolean;
}

/**
 * Group a tool catalogue into the explorer's sections: Core, Workflows, and one
 * section per server scope. Federated families (`kubernetes`, `prometheus`)
 * deduplicate the same tool across many management clusters into a single tool
 * targeted via a `management_cluster` argument; those shared tools are bucketed
 * under a neutral family-level "fleet" label rather than attributed to an
 * arbitrary peer/customer MC (ADR muster-ui-iteration-2, D1). A tool whose
 * prefix resolves to exactly one MC is bucketed under that MC; one that can't be
 * resolved to a CR falls back to a per-segment "Server: <segment>" section so
 * nothing is hidden.
 *
 * ponytail: management-cluster resolution depends on the CR tool-name prefixes;
 * when CRDs aren't readable the server sections degrade to the raw name segment.
 * Upgrade path: aggregator-provided server metadata per tool.
 */
export function groupTools(
  tools: ToolSummary[],
  servers: ServerPrefixInfo[],
): ToolGroup[] {
  const groups = new Map<string, GroupAcc>();

  const bucket = (
    key: string,
    kind: ToolGroupKind,
    fleet = false,
  ): GroupAcc => {
    const existing = groups.get(key);
    if (existing) {
      return existing;
    }
    const created: GroupAcc = {
      group: { key, kind, tools: [] },
      families: new Set(),
      clusters: new Set(),
      fleet,
    };
    groups.set(key, created);
    return created;
  };

  for (const tool of tools) {
    const name = tool.name;
    if (name.startsWith('core_')) {
      bucket('Core', 'core').group.tools.push(tool);
      continue;
    }
    if (name.startsWith('workflow_')) {
      bucket('Workflows', 'workflow').group.tools.push(tool);
      continue;
    }
    if (name.startsWith('x_')) {
      const matches = matchServers(name, servers);
      const clusters = new Set(
        matches
          .map(s => s.managementCluster)
          .filter((mc): mc is string => Boolean(mc)),
      );
      const family = matches.find(s => s.family)?.family;

      // Shared/deduplicated federated tool: one prefix maps to several
      // management clusters. Don't head it with an arbitrary peer MC (D1) --
      // bucket it under a neutral family-level fleet label.
      if (clusters.size > 1) {
        const key = `${titleCase(family ?? segmentOf(name))} (fleet)`;
        const entry = bucket(key, 'server', true);
        entry.group.tools.push(tool);
        if (family) {
          entry.families.add(family);
        }
        for (const mc of clusters) {
          entry.clusters.add(mc);
        }
        continue;
      }

      const mc = matches[0]?.managementCluster;
      if (mc) {
        const entry = bucket(mc, 'server');
        entry.group.tools.push(tool);
        if (family) {
          entry.families.add(family);
        }
        continue;
      }

      const segment = family ?? segmentOf(name);
      bucket(`Server: ${segment}`, 'server').group.tools.push(tool);
      continue;
    }
    bucket('Other', 'other').group.tools.push(tool);
  }

  // Derive each server bucket's subtitle from what it actually holds (the family
  // set / federated cluster count) rather than from the first server that
  // created it -- a multi-family MC must not be mislabelled by one family.
  for (const entry of groups.values()) {
    if (entry.group.kind !== 'server') {
      continue;
    }
    if (entry.fleet) {
      entry.group.subtitle =
        entry.clusters.size > 0 ? `${entry.clusters.size} clusters` : 'fleet';
    } else if (entry.families.size > 0) {
      entry.group.subtitle = [...entry.families].sort().join(', ');
    }
  }

  const rank = (group: ToolGroup) => {
    if (group.kind === 'core') return 0;
    if (group.kind === 'workflow') return 1;
    if (group.kind === 'other') return 3;
    return 2;
  };

  return [...groups.values()]
    .map(entry => entry.group)
    .sort((a, b) => {
      const r = rank(a) - rank(b);
      return r !== 0 ? r : a.key.localeCompare(b.key);
    });
}

/**
 * Resolve the tools belonging to one server, identified by its `x_<segment>`
 * prefix. Used to scope the browse panel to a `?server=` deep link (prefix
 * filter) instead of seeding a free-text search that also matches description
 * text -- see tools F4. Returns `undefined` when the server name can't be
 * resolved to a known prefix, so the caller can fall back to the full browse.
 */
export function toolsForServer(
  tools: ToolSummary[],
  serverName: string,
  servers: ServerPrefixInfo[],
): { prefix: string; tools: ToolSummary[] } | undefined {
  const prefix = servers.find(s => s.serverName === serverName)?.prefix;
  if (!prefix) {
    return undefined;
  }
  return {
    prefix,
    tools: tools.filter(
      t => t.name === prefix || t.name.startsWith(`${prefix}_`),
    ),
  };
}
