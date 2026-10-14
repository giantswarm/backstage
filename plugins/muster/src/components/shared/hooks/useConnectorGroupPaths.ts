import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { customizeExternalRouteRef } from '../../../routes';
import {
  connectorGroup,
  connectorGroupInfo,
  type ConnectorGroup,
} from '../../../lib/connectorGroups';
import { MUSTER_SERVER_KEY, ServerPageRow } from '../../../lib/serverGrouping';

export interface ConnectorGroupPaths {
  customize?: string;
  /** The Connectors tab: its default sub-tab, the customer's connectors. */
  connectors?: string;
  /** A sub-tab. */
  group: (group: ConnectorGroup) => string | undefined;
  /**
   * The sub-tab that lists a connector, where its crumbs lead: from its row,
   * or, before the row is read, muster's own for `muster`. Undefined while
   * the row is unknown (still loading, or not on this installation), so a
   * crumb never points to a sub-tab that does not list the connector.
   */
  listOf: (key: string, row: ServerPageRow | undefined) => string | undefined;
}

/**
 * The Customize screen's Connectors tab and its sub-tabs, where the app binds
 * the Customize page; each undefined where it does not, so a caller renders
 * plain text instead of a link to a 404.
 */
export function useConnectorGroupPaths(): ConnectorGroupPaths {
  const customizeRoute = useRouteRef(customizeExternalRouteRef);
  const customize = customizeRoute?.();
  return useMemo(() => {
    const connectors = customize ? `${customize}/connectors` : undefined;
    const group = (id: ConnectorGroup) => {
      const path = connectorGroupInfo(id).path;
      if (!connectors) {
        return undefined;
      }
      return path ? `${connectors}/${path}` : connectors;
    };
    const listOf = (key: string, row: ServerPageRow | undefined) => {
      if (row) {
        return group(connectorGroup(row));
      }
      return key === MUSTER_SERVER_KEY ? group('internal') : undefined;
    };
    return { customize, connectors, group, listOf };
  }, [customize]);
}
