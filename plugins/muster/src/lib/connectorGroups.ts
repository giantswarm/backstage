import { MCPServer, ToolGroupKey } from './k8s';
import { familyToolGroup, ServerPageRow } from './serverGrouping';
import { serverPageRows } from './serverList';

/**
 * The Connectors tab's sub-tabs: the customer's own connectors (the default),
 * the connectors for the infrastructure the platform runs on, and the Agent
 * Platform's internal servers, muster itself among them.
 */
export type ConnectorGroup = 'yours' | 'infrastructure' | 'internal';

export interface ConnectorGroupInfo {
  id: ConnectorGroup;
  /** The sub-tab's path segment under the Connectors tab; empty for the default. */
  path: string;
  title: string;
  /** What the sub-tab lists, where its title does not say it. */
  description?: string;
  /** The sub-tab's empty state. */
  empty: { title: string; description: string };
}

/** What muster is, on its row and its page. */
export const MUSTER_DESCRIPTION =
  'Connects agents to every connector and offers the platform tools.';

/** muster's page's line under its name: what it is, and that it is fixed. */
export const MUSTER_PAGE_DESCRIPTION = `${MUSTER_DESCRIPTION} It comes with the Agent Platform and cannot be changed here.`;

/** The sub-tabs, in strip order. */
export const CONNECTOR_GROUPS: readonly ConnectorGroupInfo[] = [
  {
    id: 'yours',
    path: '',
    title: 'Your connectors',
    empty: {
      title: 'No connectors yet',
      description: 'Add a connector to give agents its tools.',
    },
  },
  {
    id: 'infrastructure',
    path: 'infrastructure',
    title: 'Infrastructure',
    description:
      'Connectors for the infrastructure the platform runs on. A family has an instance per management cluster; agents name the cluster in each call.',
    empty: {
      title: 'No infrastructure connectors',
      description: 'The platform installs none on this environment.',
    },
  },
  {
    id: 'internal',
    path: 'internal',
    title: 'Internal',
    description:
      'These come with the Agent Platform and cannot be changed here. muster connects agents to every connector.',
    empty: {
      title: 'No internal connectors',
      description: 'muster reports none of the platform’s own servers.',
    },
  },
];

/** A sub-tab's definition. */
export function connectorGroupInfo(group: ConnectorGroup): ConnectorGroupInfo {
  return CONNECTOR_GROUPS.find(info => info.id === group)!;
}

/** The sub-tab a path segment under the Connectors tab names, if any. */
export function connectorGroupOfPath(
  segment: string,
): ConnectorGroup | undefined {
  return CONNECTOR_GROUPS.find(group => group.path === segment)?.id;
}

/**
 * Retired sub-tab paths and the sub-tab each now is, so a shared link still
 * lands: Infrastructure was "Families" (`families`) before it took every
 * server labelled `infrastructure`.
 */
export const LEGACY_CONNECTOR_GROUP_PATHS: Readonly<
  Record<string, ConnectorGroup>
> = { families: 'infrastructure' };

const GROUP_OF_TOOL_GROUP: Record<ToolGroupKey, ConnectorGroup> = {
  'agent-platform': 'internal',
  infrastructure: 'infrastructure',
  registered: 'yours',
};

/**
 * The sub-tab a row is listed on, from the tool-group label the shipping
 * chart stamps (`TOOL_GROUP_LABEL`) alone, a family and a single server
 * alike:
 *
 * - **Internal**: `agent-platform` (the managers for agents, models and
 *   clusters), and muster itself: it ships with the platform, and muster's
 *   own `agent-platform` preset includes its core tools.
 * - **Infrastructure**: `infrastructure`, the servers for the management
 *   clusters the platform runs on.
 * - **Your connectors**: no label, what the installation or its users
 *   registered, the customer's own families included.
 *
 * A family's members vote while a label rollout is in flight
 * (`familyToolGroup`).
 */
export function connectorGroup(row: ServerPageRow): ConnectorGroup {
  if (row.kind === 'core') {
    return 'internal';
  }
  return GROUP_OF_TOOL_GROUP[
    row.kind === 'family'
      ? familyToolGroup(row.servers)
      : row.server.getToolGroupKey()
  ];
}

/**
 * How many rows each sub-tab lists. muster itself counts only where it runs
 * (`withMuster`): without a muster installation the list is not shown at all.
 */
export function connectorGroupCounts(
  servers: MCPServer[],
  withMuster: boolean,
): Record<ConnectorGroup, number> {
  const counts: Record<ConnectorGroup, number> = {
    yours: 0,
    infrastructure: 0,
    internal: 0,
  };
  for (const row of serverPageRows(servers)) {
    if (row.kind !== 'core' || withMuster) {
      counts[connectorGroup(row)] += 1;
    }
  }
  return counts;
}
