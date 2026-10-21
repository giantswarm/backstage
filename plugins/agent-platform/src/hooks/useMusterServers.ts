import { useMemo } from 'react';
import { useResources } from '@giantswarm/backstage-plugin-kubernetes-react';
import { MCPServer } from '@giantswarm/backstage-plugin-muster';

import { connectorLabels, type ServerInfo } from '../lib/toolset';

/** The start of an organization's namespace, whose servers muster keys by namespace. */
const ORGANIZATION_PREFIX = 'org-';

/**
 * The grouping's view of one MCPServer CR. muster keys a server of an
 * organization's namespace `<namespace>/<name>` (its tools' `server`, what
 * `server:` selects) and prefixes its tools `x_<namespace>_<segment>`; a
 * server of muster's own namespace keeps its name.
 */
export function serverInfoOf(server: MCPServer): ServerInfo {
  const displayName = server.getDisplayNameAnnotation();
  const namespace = server.getNamespace();
  const tenant = namespace?.startsWith(ORGANIZATION_PREFIX) ? namespace : '';
  const prefix = server.getToolNamePrefix();
  return {
    name: tenant ? `${tenant}/${server.getName()}` : server.getName(),
    family: server.getFamily(),
    group: server.getToolGroupKey(),
    toolNamePrefix: tenant
      ? `x_${tenant}_${prefix.slice('x_'.length)}`
      : prefix,
    state: server.getState(),
    oauth: server.getAuth()?.type === 'oauth',
    ...(displayName ? { displayName } : {}),
  };
}

export type MusterServers = {
  /** Every MCPServer CR on the installation — signed in to or not. */
  servers: ServerInfo[];
  /** The same CRs, for muster's own helpers (`serverPageResolver`). */
  resources: MCPServer[];
  /**
   * What people call each connector, by surface name ({@link connectorLabels}):
   * built once per list, for the many lookups a page makes.
   */
  labels: ReadonlyMap<string, string>;
  isLoading: boolean;
  /** True when the CRs could not be read (no muster, no access). */
  isUnavailable: boolean;
};

/**
 * The MCPServer CRs of one installation, read through the Backstage
 * kubernetes proxy like the muster plugin's own servers page does — no muster
 * session needed. This is what lets the Tools step list *every* registered
 * server, not just the ones the author's session has authenticated with, and
 * what the tool-group label is read from.
 *
 * Disabled (and empty) without an installation.
 */
export function useMusterServers(
  installation: string | undefined,
): MusterServers {
  const { resources, isLoading, errors } = useResources(
    installation ? [installation] : [],
    MCPServer,
    {},
    { enabled: Boolean(installation) },
  );

  const servers = useMemo(() => resources.map(serverInfoOf), [resources]);
  const labels = useMemo(() => connectorLabels(servers), [servers]);

  return {
    servers,
    resources,
    labels,
    isLoading: Boolean(installation) && isLoading,
    isUnavailable: errors.length > 0 && resources.length === 0,
  };
}
