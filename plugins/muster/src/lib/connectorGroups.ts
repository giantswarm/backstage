import { MCPServer, ToolGroupKey } from './k8s';
import {
  familyToolGroup,
  partitionServers,
  ServerPageRow,
} from './serverGrouping';

/**
 * The Connectors tab's sub-tabs: the customer's own connectors (the default),
 * the families that reach every management cluster, and the Agent Platform's
 * internal servers, muster itself among them.
 */
export type ConnectorGroup = 'yours' | 'families' | 'internal';

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
    id: 'families',
    path: 'families',
    title: 'Families',
    description:
      'A family is one connector with an instance per management cluster; agents name the cluster in each call.',
    empty: {
      title: 'No families',
      description: 'No connector here has an instance per management cluster.',
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

const GROUP_OF_TOOL_GROUP: Record<ToolGroupKey, ConnectorGroup> = {
  'agent-platform': 'internal',
  infrastructure: 'families',
  registered: 'yours',
};

/**
 * The sub-tab a row is listed on. The tool-group label the shipping chart
 * stamps (`TOOL_GROUP_LABEL`) decides: `agent-platform` is internal (the
 * managers for agents, models and clusters), `infrastructure` the families.
 * muster itself is internal: it ships with the platform, and muster's own
 * `agent-platform` preset includes its core tools. A family without the label
 * is still a family (`spec.family` makes it one connector across management
 * clusters), so an installation whose charts carry no labels yet does not
 * list its families as the customer's. Everything else is the customer's.
 */
export function connectorGroup(row: ServerPageRow): ConnectorGroup {
  if (row.kind === 'core') {
    return 'internal';
  }
  if (row.kind === 'family') {
    // `registered` here means no member declares a group.
    const group = familyToolGroup(row.servers);
    return group === 'registered' ? 'families' : GROUP_OF_TOOL_GROUP[group];
  }
  return GROUP_OF_TOOL_GROUP[row.server.getToolGroupKey()];
}

/** How many rows each sub-tab lists, muster itself included. */
export function connectorGroupCounts(
  servers: MCPServer[],
): Record<ConnectorGroup, number> {
  const counts: Record<ConnectorGroup, number> = {
    yours: 0,
    families: 0,
    internal: 0,
  };
  const rows: ServerPageRow[] = [
    ...partitionServers(servers).flatMap(group => group.rows),
    { kind: 'core' },
  ];
  for (const row of rows) {
    counts[connectorGroup(row)] += 1;
  }
  return counts;
}
