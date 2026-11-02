import {
  type CatalogueGroup,
  type DeclaredToolset,
  type ServerInfo,
  surfaceName,
} from './toolset';
import { reachedConnectors } from './toolsetReach';

/** One connector's logo, as the agent page and the Agents list show it. */
export type ConnectorMark = {
  key: string;
  name: string;
  icon?: string;
  url?: string;
  detail?: string;
};

/** A server the agent binds directly rather than through the gateway. */
export type DirectServer = {
  name: string;
  /** Its `RemoteMCPServer`'s URL, once read. */
  url?: string;
  detail?: string;
};

/**
 * Each muster connector's logo source, by surface name: the first CR of a
 * family with an icon, else its first URL.
 */
export function connectorLogoSources(
  servers: readonly ServerInfo[],
): Map<string, { icon?: string; url?: string }> {
  const bySurface = new Map<string, { icon?: string; url?: string }>();
  for (const server of servers) {
    const name = surfaceName(server);
    const known = bySurface.get(name);
    bySurface.set(name, {
      icon: known?.icon ?? server.icon,
      url: known?.url ?? server.url,
    });
  }
  return bySurface;
}

/**
 * An agent's connectors as logos: the ones its toolset names
 * (`reachedConnectors`; none for full or implicit access, which the reach
 * sentence says), then the servers it binds directly, each by its display
 * name.
 */
export function connectorMarks({
  toolset,
  groups,
  sources,
  labels,
  direct = [],
}: {
  toolset: DeclaredToolset | undefined;
  groups?: readonly CatalogueGroup[];
  sources: ReadonlyMap<string, { icon?: string; url?: string }>;
  labels: ReadonlyMap<string, string>;
  direct?: readonly DirectServer[];
}): ConnectorMark[] {
  return [
    ...reachedConnectors(toolset, groups).map(name => ({
      key: `server:${name}`,
      name: labels.get(name) ?? name,
      ...sources.get(name),
    })),
    ...direct.map((server, index) => ({
      // The server name is not unique: two bindings may scope one server
      // differently.
      key: `${server.name}#${index}`,
      name: labels.get(server.name) ?? server.name,
      icon: sources.get(server.name)?.icon,
      url: server.url ?? sources.get(server.name)?.url,
      ...(server.detail ? { detail: server.detail } : {}),
    })),
  ];
}
