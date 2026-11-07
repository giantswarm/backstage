import type { CatalogueGroup, DeclaredToolset } from './toolset';
import { reachedConnectors } from './toolsetReach';

/** One connector's logo, as the agent page and the Agents list show it. */
export type ConnectorMark = {
  key: string;
  name: string;
  icon?: string;
  detail?: string;
  /** The binding pauses for the person's approval before every call. */
  approval?: boolean;
};

/**
 * A server the agent binds directly rather than through the gateway, named
 * by `directServerName`.
 */
export type DirectServer = ConnectorMark;

/**
 * An agent's connectors as logos: the ones its toolset names
 * (`reachedConnectors`; none for full or implicit access, which the reach
 * sentence says), each by its display name and icon, then the servers it
 * binds directly.
 */
export function connectorMarks({
  toolset,
  groups,
  icons,
  labels,
  direct = [],
}: {
  toolset: DeclaredToolset | undefined;
  groups?: readonly CatalogueGroup[];
  icons: ReadonlyMap<string, string>;
  labels: ReadonlyMap<string, string>;
  direct?: readonly DirectServer[];
}): ConnectorMark[] {
  return [
    ...reachedConnectors(toolset, groups).map(name => ({
      key: `server:${name}`,
      name: labels.get(name) ?? name,
      icon: icons.get(name),
    })),
    ...direct,
  ];
}
