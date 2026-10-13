import { MCPServer } from './k8s';
import { familyToolGroup, ServerPageRow } from './serverGrouping';
import { serverPageRows } from './serverList';

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

/**
 * The sub-tab a row is listed on, from the tool-group label the shipping
 * chart stamps (`TOOL_GROUP_LABEL`) and the row's shape:
 *
 * - **Internal**: muster itself (it ships with the platform, and muster's own
 *   `agent-platform` preset includes its core tools), every server or family
 *   labelled `agent-platform` (the managers for agents, models and clusters),
 *   and a singular server labelled `infrastructure` — shipped by the platform,
 *   but not a family.
 * - **Families**: every other family (`spec.family`: one connector with an
 *   instance per management cluster), labelled `infrastructure` or not, so an
 *   installation whose charts carry no labels yet does not list its families
 *   as the customer's.
 * - **Your connectors**: singular servers without the label, what the
 *   installation or its users registered.
 */
export function connectorGroup(row: ServerPageRow): ConnectorGroup {
  if (row.kind === 'core') {
    return 'internal';
  }
  if (row.kind === 'family') {
    return familyToolGroup(row.servers) === 'agent-platform'
      ? 'internal'
      : 'families';
  }
  return row.server.getToolGroup() ? 'internal' : 'yours';
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
    families: 0,
    internal: 0,
  };
  for (const row of serverPageRows(servers)) {
    if (row.kind !== 'core' || withMuster) {
      counts[connectorGroup(row)] += 1;
    }
  }
  return counts;
}
