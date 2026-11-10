import type { ConnectorName } from '@giantswarm/backstage-plugin-gs-common';
import { MCPServer, TOOL_GROUP_ORDER, ToolGroupKey } from './k8s';

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
 * (Agent Platform, Infrastructure, Registered connectors), each group in the row
 * shape the UI renders: servers sharing a `spec.family.name` collapse into one
 * family row (equivalent instances federated across management clusters,
 * shown once with per-cluster health), singular servers are a row each.
 *
 * The tier comes from the tool-group label the shipping chart stamps on the
 * CR ({@link MCPServer.getToolGroup}); nothing is inferred from names,
 * provenance or topology. An installation whose charts carry no labels yet
 * therefore lists everything under Registered connectors -- one long list,
 * never an empty or broken page. Every group is always present, possibly with
 * no rows, so callers render a stable set of sections.
 *
 * The MCP-servers manager reads the family rows across all groups through
 * {@link familyGroups} to measure each family's fleet coverage.
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

/**
 * The `:server` segment of muster's own server page: its core tools
 * (`core_*`, `workflow_*`) are children of muster the way every other tool is a
 * child of the server offering it. A CR literally named `muster` is shadowed by
 * it, as one named `new` is by the registration wizard.
 */
export const MUSTER_SERVER_KEY = 'muster';

/**
 * What people call muster's own entry: its row in the Connectors list, its
 * page's title and breadcrumb. Only the name shown; {@link MUSTER_SERVER_KEY}
 * stays what its URL, links and muster use.
 */
export const MUSTER_DISPLAY_NAME = 'Muster';

/** What a server page shows: a list row, or muster itself. */
export type ServerPageRow = ServerRow | { kind: 'core' };

/**
 * The `:server` segment of a row's page: the family name for a Server family,
 * the CR name for a singular server, {@link MUSTER_SERVER_KEY} for muster.
 */
export function serverRowKey(row: ServerPageRow): string {
  switch (row.kind) {
    case 'family':
      return row.family;
    case 'server':
      return row.server.getName();
    default:
      return MUSTER_SERVER_KEY;
  }
}

/**
 * What the connector naming rule needs to know of one MCPServer: the shape
 * muster-backend's `/servers/names` answers too (gs-common's
 * `ConnectorName`), so a CR, the agent platform's own view of a server and
 * that answer all fit it.
 */
export type ConnectorNameSource = ConnectorName;

/** {@link ConnectorNameSource} of an MCPServer. */
export function connectorNameSource(server: MCPServer): ConnectorNameSource {
  const family = server.getFamily();
  const displayName = server.getDisplayNameAnnotation();
  return {
    name: server.getName(),
    ...(family ? { family } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

const sameLabel = (label: string) => label.trim().toLowerCase();

/**
 * What people call each connector, keyed by the name its page, links,
 * `server:` selectors and muster use (the family name for a family, else the
 * CR name). One rule for every surface:
 *
 * - A connector is called by its `ui.giantswarm.io/display-name`. A family
 *   takes the one its annotated members agree on (one chart stamps them all;
 *   while a rollout is in flight the annotated ones decide), and members that
 *   disagree name nothing.
 * - Without one, it is called by its own name.
 * - Connectors that would read the same (two annotated alike, or one
 *   annotated like another's name; case aside) are called by their own names
 *   instead, so no two read alike.
 *
 * A singular CR named like a family is left out: the family's page is the one
 * its name opens.
 */
export function connectorDisplayNames(
  servers: readonly ConnectorNameSource[],
): Map<string, string> {
  const families = new Set(
    servers.map(server => server.family).filter(Boolean),
  );
  const annotations = new Map<string, Set<string>>();
  for (const server of servers) {
    if (!server.family && families.has(server.name)) {
      continue;
    }
    const surface = server.family ?? server.name;
    const names = annotations.get(surface) ?? new Set<string>();
    if (server.displayName) {
      names.add(server.displayName);
    }
    annotations.set(surface, names);
  }
  const labels = new Map(
    [...annotations].map(([surface, names]) => [
      surface,
      names.size === 1 ? [...names][0] : surface,
    ]),
  );
  // Falling back to a name can collide with another's display name in turn;
  // every round turns at least one display name back into a (unique) name.
  for (;;) {
    const count = new Map<string, number>();
    for (const label of labels.values()) {
      count.set(sameLabel(label), (count.get(sameLabel(label)) ?? 0) + 1);
    }
    const colliding = [...labels].filter(
      ([surface, label]) =>
        label !== surface && count.get(sameLabel(label))! > 1,
    );
    if (colliding.length === 0) {
      return labels;
    }
    for (const [surface] of colliding) {
      labels.set(surface, surface);
    }
  }
}

/** {@link connectorDisplayNames} of the MCPServer CRs of one installation. */
export function mcpServerDisplayNames(
  servers: readonly MCPServer[],
): Map<string, string> {
  return connectorDisplayNames(servers.map(connectorNameSource));
}

/**
 * What people call the connector `name` names on `installation`, by
 * {@link connectorDisplayNames} over that installation's servers; `name`
 * itself when there is no such connector.
 */
export function connectorDisplayNameOn(
  servers: readonly MCPServer[],
  installation: string | undefined,
  name: string,
): string {
  const names = mcpServerDisplayNames(
    servers.filter(server => server.cluster === installation),
  );
  return names.get(name) ?? name;
}

/**
 * What a row is called for people, by {@link connectorDisplayNames}: its
 * display name where it has a distinct one, else {@link serverRowKey};
 * muster's own row is {@link MUSTER_DISPLAY_NAME}.
 */
export function serverRowDisplayName(
  row: ServerPageRow,
  names: ReadonlyMap<string, string>,
): string {
  if (row.kind === 'core') {
    return MUSTER_DISPLAY_NAME;
  }
  const key = serverRowKey(row);
  return names.get(key) ?? key;
}

/**
 * The row a server page's `:server` segment names on this installation, or
 * undefined when the installation has no such server. A family wins over a
 * singular CR of the same name: the family's page is the one every family link
 * points at.
 */
export function findServerRow(
  servers: MCPServer[],
  key: string,
): ServerPageRow | undefined {
  if (key === MUSTER_SERVER_KEY) {
    return { kind: 'core' };
  }
  const members = servers.filter(s => s.getFamily() === key);
  if (members.length > 0) {
    return {
      kind: 'family',
      family: key,
      servers: [...members].sort((a, b) =>
        a.getName().localeCompare(b.getName()),
      ),
    };
  }
  const server = servers.find(s => !s.getFamily() && s.getName() === key);
  return server ? { kind: 'server', server } : undefined;
}

/**
 * The `:server` segment of the page that shows each MCPServer's usage on one
 * installation, by CR name: the family's for a family member (instances have
 * no page of their own; the family's Usage tab lists each one), else its own.
 * A server is left out where no page shows it: one named like a family, or
 * muster's own page, which takes that name. A name not in the map (muster's
 * own tools, a server since removed) has no page either.
 */
export function connectorPageKeys(
  servers: readonly MCPServer[],
): Map<string, string> {
  const families = new Set(servers.map(server => server.getFamily()));
  const keys = new Map<string, string>();
  for (const server of servers) {
    const key = server.getFamily() ?? server.getName();
    const shadowed =
      key === MUSTER_SERVER_KEY || (!server.getFamily() && families.has(key));
    if (!shadowed) {
      keys.set(server.getName(), key);
    }
  }
  return keys;
}
