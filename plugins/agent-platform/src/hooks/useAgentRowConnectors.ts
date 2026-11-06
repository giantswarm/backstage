import { useMemo } from 'react';

import type { AgentRow } from '../components/AgentsDataProvider';
import { connectorIcons } from '../components/AgentDetailPage/helpers';
import { type ConnectorMark, connectorMarks } from '../lib/connectorMarks';
import { reachedConnectors, reachNeedsCatalogue } from '../lib/toolsetReach';
import { useMusterServers } from './useMusterServers';
import { useReachCatalogue } from './useReachCatalogue';

/**
 * A list row's connectors, as the agent page's Connectors section shows them:
 * read from the toolset and direct bindings the row already carries. The
 * installation's MCPServers (logos, display names) and, for a tool picked one
 * by one, the caller's catalogue are the agent page's cached queries — one
 * per installation, however many rows ask — and are read only for a row whose
 * toolset names a connector.
 */
export function useAgentRowConnectors(row: AgentRow): ConnectorMark[] {
  const needsCatalogue = reachNeedsCatalogue(row.toolset);
  const groups = useReachCatalogue(row.installation, needsCatalogue);
  const names = needsCatalogue || reachedConnectors(row.toolset).length > 0;
  const muster = useMusterServers(names ? row.installation : undefined);
  const icons = useMemo(() => connectorIcons(muster.servers), [muster.servers]);
  return useMemo(
    () =>
      connectorMarks({
        toolset: row.toolset,
        groups,
        icons,
        labels: muster.labels,
        direct: row.directServers,
      }),
    [row.toolset, row.directServers, groups, icons, muster.labels],
  );
}
