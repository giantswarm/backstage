import { MCPServer, ToolGroupKey } from './k8s';
import { familyToolGroup, ServerPageRow } from './serverGrouping';

/** What muster is, on its row and its page. */
export const MUSTER_DESCRIPTION =
  'Connects agents to every connector and offers the platform tools.';

/** muster's page's line under its name: what it is, and that it is fixed. */
export const MUSTER_PAGE_DESCRIPTION = `${MUSTER_DESCRIPTION} It comes with the Agent Platform and cannot be changed here.`;

/** An infrastructure family's page's line under its name. */
export const INFRASTRUCTURE_FAMILY_NOTE =
  'It has an instance per management cluster; agents name the cluster in each call.';

/**
 * The tag the tool-group label the shipping chart stamps (`TOOL_GROUP_LABEL`)
 * reads as. A registered connector, with no label, has none.
 */
const TAG_OF_TOOL_GROUP: Record<ToolGroupKey, string | undefined> = {
  'agent-platform': 'agent-platform',
  infrastructure: 'infrastructure',
  registered: undefined,
};

/** The tag muster itself carries: it ships with the Agent Platform. */
const MUSTER_TAG = 'agent-platform';

/**
 * The Connectors tab's retired sub-tab paths and the tag each now filters by,
 * so a shared link still lands, until the end of 2026: Infrastructure (and
 * "Families" before it) and Internal.
 */
export const RETIRED_CONNECTOR_GROUP_TAGS: Readonly<Record<string, string>> = {
  infrastructure: 'infrastructure',
  families: 'infrastructure',
  internal: 'agent-platform',
};

/**
 * The tool group a connector's servers are listed under: a server's own, a
 * family's by its members' vote while a label rollout is in flight
 * (`familyToolGroup`).
 */
function toolGroupOf(servers: readonly MCPServer[]): ToolGroupKey {
  return familyToolGroup([...servers]);
}

/**
 * A connector's tags: the one its tool-group label reads as (`infrastructure`
 * or `agent-platform`) first, then its servers' own (`ui.giantswarm.io/tags`,
 * every tag of a family's members), in order and without repeats. The derived
 * tag is read-only: the edit form shows and writes only the servers' own.
 */
export function connectorTags(servers: readonly MCPServer[]): string[] {
  const derived =
    servers.length > 0 ? TAG_OF_TOOL_GROUP[toolGroupOf(servers)] : undefined;
  return [
    ...new Set([
      ...(derived ? [derived] : []),
      ...servers.flatMap(server => server.getTags()),
    ]),
  ];
}

/** The servers a row stands for; none for muster itself. */
function rowServers(row: ServerPageRow): MCPServer[] {
  if (row.kind === 'server') {
    return [row.server];
  }
  return row.kind === 'family' ? row.servers : [];
}

/** A row's tags (`connectorTags`); muster's own is `agent-platform`. */
export function rowTags(row: ServerPageRow): string[] {
  return row.kind === 'core' ? [MUSTER_TAG] : connectorTags(rowServers(row));
}

/**
 * Whether a row is a registered connector: no tool-group label, what the
 * installation or its users registered.
 */
export function isRegisteredRow(row: ServerPageRow): boolean {
  return row.kind !== 'core' && toolGroupOf(rowServers(row)) === 'registered';
}
