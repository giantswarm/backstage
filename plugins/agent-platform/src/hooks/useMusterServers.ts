import { useMemo } from 'react';
import { useResources } from '@giantswarm/backstage-plugin-kubernetes-react';
import { MCPServer } from '@giantswarm/backstage-plugin-muster';

import type { ServerInfo } from '../lib/toolset';

/** The grouping's view of one MCPServer CR. */
export function serverInfoOf(server: MCPServer): ServerInfo {
  return {
    name: server.getName(),
    family: server.getFamily(),
    group: server.getToolGroupKey(),
    toolNamePrefix: server.getToolNamePrefix(),
    state: server.getState(),
    oauth: server.getAuth()?.type === 'oauth',
  };
}

export type MusterServers = {
  /** Every MCPServer CR on the installation — signed in to or not. */
  servers: ServerInfo[];
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

  return {
    servers,
    isLoading: Boolean(installation) && isLoading,
    isUnavailable: errors.length > 0 && resources.length === 0,
  };
}
