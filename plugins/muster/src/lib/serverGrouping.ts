import {
  MCPServer,
  MCPServerSeverity,
  TOOL_GROUP_ORDER,
  ToolGroupKey,
  mcpServerStateSeverity,
  worstSeverity,
} from './k8s';

/** Placeholder for a missing family / management-cluster label. */
export const UNLABELED = '—';

/**
 * A server family: the MCPServer CRs sharing one `spec.family.name`, i.e. the
 * same server federated across management clusters. Rendered as one row with
 * per-cluster pills; the unit fleet coverage is measured for.
 */
export type StandardGroup = { family: string; servers: MCPServer[] };

/**
 * One row of the MCP servers page: a family collapsed into a single row, or a
 * singular server (no `spec.family`) standing on its own.
 */
export type ServerRow =
  | { kind: 'family'; family: string; servers: MCPServer[] }
  | { kind: 'server'; server: MCPServer };

/** The servers of one tool group, in the row shape the page renders. */
export type ToolGroupPartition = {
  group: ToolGroupKey;
  /** Family rows first (alphabetical), then singular servers (alphabetical). */
  rows: ServerRow[];
};

/**
 * The tool group a family is rendered under. Its members should agree -- one
 * chart stamps them all -- but while a label rollout is in flight across a
 * fleet only some management clusters carry it. The family stays one row
 * either way: the labelled members decide (the most common declared group,
 * ties broken by display order), and a family no member has labelled yet is
 * a Registered server like any other unlabelled CR.
 */
export function familyToolGroup(servers: MCPServer[]): ToolGroupKey {
  const votes = new Map<ToolGroupKey, number>();
  for (const server of servers) {
    const group = server.getToolGroup();
    if (group) {
      votes.set(group, (votes.get(group) ?? 0) + 1);
    }
  }
  if (votes.size === 0) {
    return 'registered';
  }
  return [...votes.entries()].sort(
    (a, b) =>
      b[1] - a[1] ||
      TOOL_GROUP_ORDER.indexOf(a[0]) - TOOL_GROUP_ORDER.indexOf(b[0]),
  )[0][0];
}

/**
 * Partition a muster instance's MCPServer CRs by tool group, in display order
 * (Agent Platform, Infrastructure, Registered servers), each group in the row
 * shape the UI renders: servers sharing a `spec.family.name` collapse into one
 * family row (equivalent instances federated across management clusters,
 * shown once with per-cluster health), singular servers are a row each.
 *
 * The tier comes from the tool-group label the shipping chart stamps on the
 * CR ({@link MCPServer.getToolGroup}); nothing is inferred from names,
 * provenance or topology. An installation whose charts carry no labels yet
 * therefore lists everything under Registered servers -- one long list,
 * never an empty or broken page. Every group is always present, possibly with
 * no rows, so callers render a stable set of sections.
 *
 * Shared by the MCP-servers manager and the dashboard's capability view so
 * both group the fleet identically; fleet coverage reads the family rows
 * across all groups through {@link familyGroups}.
 */
export function partitionServers(servers: MCPServer[]): ToolGroupPartition[] {
  const families = new Map<string, MCPServer[]>();
  const singular: MCPServer[] = [];

  for (const server of servers) {
    const family = server.getFamily();
    if (family) {
      families.set(family, [...(families.get(family) ?? []), server]);
    } else {
      singular.push(server);
    }
  }

  const rowsByGroup = new Map<ToolGroupKey, ServerRow[]>(
    TOOL_GROUP_ORDER.map(group => [group, []]),
  );
  const push = (group: ToolGroupKey, row: ServerRow) =>
    rowsByGroup.get(group)!.push(row);

  for (const [family, members] of [...families.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    push(familyToolGroup(members), {
      kind: 'family',
      family,
      servers: members,
    });
  }
  for (const server of [...singular].sort((a, b) =>
    a.getName().localeCompare(b.getName()),
  )) {
    push(server.getToolGroupKey(), { kind: 'server', server });
  }

  return TOOL_GROUP_ORDER.map(group => ({
    group,
    rows: rowsByGroup.get(group)!,
  }));
}

/**
 * Every family row across all tool groups, alphabetical -- the families fleet
 * coverage is measured for. Federation is a row shape, not a tier: a family
 * reaches across the fleet whichever group it is listed under.
 */
export function familyGroups(partition: ToolGroupPartition[]): StandardGroup[] {
  return partition
    .flatMap(group => group.rows)
    .flatMap(row =>
      row.kind === 'family'
        ? [{ family: row.family, servers: row.servers }]
        : [],
    )
    .sort((a, b) => a.family.localeCompare(b.family));
}

export type Representative = {
  /** The server whose shared config/auth/tools are shown for the family. */
  server: MCPServer;
  /**
   * Whether `server` legitimately stands in for the family on this screen: it is
   * the active installation's own server, or at least a connected one. When
   * false, no single MC should head the family (label it neutrally, e.g.
   * "kubernetes (fleet)") because the representative is an arbitrary fallback.
   */
  qualified: boolean;
};

/**
 * Choose the server that represents a federated family's shared config/auth/tools.
 *
 * A federated family is replicated across many management clusters whose auth
 * chains legitimately differ, so "which one do we show?" matters: showing an
 * arbitrary peer/customer MC misrepresents the family on another installation's
 * screen. The order (ADR muster-ui-iteration-2, D1) is:
 *
 * 1. the active installation's own server (`managementCluster === active`), else
 * 2. a connected server (`Connected`/`Running`), else
 * 3. the first server as a fallback, flagged `qualified: false` so the caller
 *    labels the family neutrally rather than by that server's MC.
 *
 * Note: severity `ok` is NOT a sufficient signal since `Auth Required` is now
 * `ok` -- list order would then surface an arbitrary (alphabetically-first) MC.
 */
export function selectRepresentative(
  servers: MCPServer[],
  activeInstallation?: string,
): Representative | undefined {
  if (servers.length === 0) {
    return undefined;
  }
  const own =
    activeInstallation !== undefined
      ? servers.find(s => s.getManagementCluster() === activeInstallation)
      : undefined;
  if (own) {
    return { server: own, qualified: true };
  }
  const connected = servers.find(
    s => s.getState() === 'Connected' || s.getState() === 'Running',
  );
  if (connected) {
    return { server: connected, qualified: true };
  }
  return { server: servers[0], qualified: false };
}

export type McPresence = {
  mc: string;
  severity: MCPServerSeverity;
  state: string;
  server: MCPServer;
};

/**
 * Collapse a family's federated instances into one health entry per management
 * cluster: the worst severity in that cluster and the worst-state server as the
 * representative for its diagnostics. Alphabetical by cluster; callers that
 * want the clusters needing a look first apply
 * {@link orderPresenceDegradedFirst}.
 */
export function presenceByMc(servers: MCPServer[]): McPresence[] {
  const byMc = new Map<string, MCPServer[]>();
  for (const s of servers) {
    const mc = s.getManagementCluster() ?? UNLABELED;
    byMc.set(mc, [...(byMc.get(mc) ?? []), s]);
  }
  return [...byMc.entries()]
    .map(([mc, group]) => {
      const severity = group.reduce<MCPServerSeverity>(
        (acc, s) => worstSeverity(acc, mcpServerStateSeverity(s.getState())),
        'ok',
      );
      const worst = group.reduce((acc, s) =>
        mcpServerStateSeverity(s.getState()) === severity ? s : acc,
      );
      return {
        mc,
        severity,
        state: worst.getState() ?? 'unknown',
        server: worst,
      };
    })
    .sort((a, b) => a.mc.localeCompare(b.mc));
}

// Severity bands for display order. Failed before merely disconnected before
// unknown, and the healthy majority last -- the clusters that need a look are
// the reason to read the row at all.
const DEGRADED_FIRST: Record<MCPServerSeverity, number> = {
  error: 0,
  warning: 1,
  unknown: 2,
  ok: 3,
};

/**
 * The per-cluster entries with the degraded clusters first (most severe
 * first), alphabetical within a band. Drives both the collapsed family row and
 * the full cluster list shown when it is expanded, so a failing cluster is
 * never buried behind twenty healthy pills.
 */
export function orderPresenceDegradedFirst(
  presence: McPresence[],
): McPresence[] {
  return [...presence].sort(
    (a, b) =>
      DEGRADED_FIRST[a.severity] - DEGRADED_FIRST[b.severity] ||
      a.mc.localeCompare(b.mc),
  );
}

/**
 * How many cluster pills a collapsed family row shows before the healthy
 * remainder folds into a "+N more" count. Eight keeps the row on one line at
 * the pages' 1024px reading width even when two of the pills carry a state
 * ("gaggle Failed" is half again as wide as "gaggle"); a family across two
 * dozen clusters used to wrap onto a second and third line.
 */
export const SUMMARY_PILL_LIMIT = 8;

export type PresenceSummary = {
  /** Pills to render: every degraded cluster, then healthy ones while room remains. */
  shown: McPresence[];
  /** Healthy clusters folded into the "+N more" count. */
  folded: number;
};

/**
 * The pills a collapsed family row shows. Degraded clusters are never folded
 * (they are what the row is for, even when there are more than `limit` of
 * them); healthy clusters fill the remaining room. A single healthy leftover
 * is shown rather than folded -- "+1 more" costs the same width as the pill.
 */
export function summarizePresence(
  presence: McPresence[],
  limit = SUMMARY_PILL_LIMIT,
): PresenceSummary {
  const ordered = orderPresenceDegradedFirst(presence);
  const degraded = ordered.filter(p => p.severity !== 'ok');
  const healthy = ordered.filter(p => p.severity === 'ok');
  const room = Math.max(0, limit - degraded.length);
  const shownHealthy =
    healthy.length <= room + 1 ? healthy : healthy.slice(0, room);
  return {
    shown: [...degraded, ...shownHealthy],
    folded: healthy.length - shownHealthy.length,
  };
}

/**
 * Every management cluster any standard family is federated across, sorted:
 * the fleet a family's coverage is measured against. Servers without the
 * management-cluster label contribute nothing here.
 */
export function fleetManagementClusters(standard: StandardGroup[]): string[] {
  const clusters = new Set<string>();
  for (const group of standard) {
    for (const server of group.servers) {
      const mc = server.getManagementCluster();
      if (mc) {
        clusters.add(mc);
      }
    }
  }
  return [...clusters].sort((a, b) => a.localeCompare(b));
}

export type FamilyCoverage = {
  family: string;
  /** Clusters the family is deployed on, one entry each, degraded first. */
  present: McPresence[];
  /** Fleet clusters the family is not deployed on, sorted. */
  missing: string[];
  /** The present clusters whose instance is not healthy. */
  degraded: McPresence[];
  /** Size of the fleet the coverage is measured against. */
  fleetSize: number;
};

/**
 * How far one family reaches across the fleet: where it is deployed, where it
 * is deployed but not connected, and where it is not deployed at all. The
 * last is what distinguishes a family still being rolled out (present on 10
 * of 24 clusters) from one that is failing -- both used to read as a shorter
 * row of pills.
 */
export function familyCoverage(
  group: StandardGroup,
  fleet: string[],
): FamilyCoverage {
  const present = orderPresenceDegradedFirst(presenceByMc(group.servers));
  const covered = new Set(present.map(p => p.mc));
  return {
    family: group.family,
    present,
    missing: fleet.filter(mc => !covered.has(mc)),
    degraded: present.filter(p => p.severity !== 'ok'),
    fleetSize: fleet.length,
  };
}
