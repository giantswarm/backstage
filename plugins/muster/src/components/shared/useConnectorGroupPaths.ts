import { useRouteRef } from '@backstage/frontend-plugin-api';
import { customizeExternalRouteRef } from '../../routes';
import {
  connectorGroupInfo,
  type ConnectorGroup,
} from '../../lib/connectorGroups';

/**
 * The Customize screen's Connectors tab and its sub-tabs, where the app binds
 * the Customize page; each undefined where it does not, so a caller renders
 * plain text instead of a link to a 404.
 */
export function useConnectorGroupPaths(): {
  customize?: string;
  connectors?: string;
  group: (group: ConnectorGroup) => string | undefined;
} {
  const customizeRoute = useRouteRef(customizeExternalRouteRef);
  const customize = customizeRoute?.();
  const connectors = customize ? `${customize}/connectors` : undefined;
  return {
    customize,
    connectors,
    group: group => {
      const path = connectorGroupInfo(group).path;
      if (!connectors) {
        return undefined;
      }
      return path ? `${connectors}/${path}` : connectors;
    },
  };
}
