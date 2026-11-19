import { useMemo } from 'react';
import { useResources } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  connectorAuthName,
  connectorToolNamePrefix,
  isOrganizationServerKey,
  MCPServer,
  type ToolSummary,
  useMusterKeyedServers,
} from '@giantswarm/backstage-plugin-muster';

import { connectorLabels, type ServerInfo } from '../lib/toolset';

/**
 * The grouping's view of one MCPServer CR, named as muster names it: by the
 * muster plugin's `connectorAuthName` (its name in muster's namespace,
 * `<namespace>/<name>` in an organization's -- its tools' `server`, what
 * `server:` selects) with its tools' prefix by `connectorToolNamePrefix`.
 */
export function serverInfoOf(server: MCPServer): ServerInfo {
  const displayName = server.getDisplayNameAnnotation();
  const icon = server.getStatusIcon();
  const tags = server.getTags();
  return {
    name: connectorAuthName(server),
    family: server.getFamily(),
    group: server.getToolGroupKey(),
    toolNamePrefix: connectorToolNamePrefix(server),
    state: server.getState(),
    ...(server.getSuspended() ? { suspended: true } : {}),
    oauth: server.getAuth()?.type === 'oauth',
    signInTool:
      server.getAuth()?.type === 'oauth' && !server.isServedPerSession(),
    ...(displayName ? { displayName } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(icon ? { icon } : {}),
  };
}

/**
 * The connectors an agent in `tenant` may be given, their tools, and the ones
 * muster says the session must sign in to: muster's own servers, for
 * everyone, and the servers of the agent's own namespace; another
 * namespace's servers are its agents' only, whether a CR, a tool's `server`
 * or muster's sign-in list names them. Everything when no tenant is known.
 * An organization's own RemoteMCPServers (`list_organization_connectors`)
 * are not muster servers: an agent's toolset selects muster's, so they are
 * not offered here.
 */
export function connectorsForTenant(
  servers: readonly ServerInfo[],
  tools: readonly ToolSummary[],
  tenant: string | undefined,
  serversRequiringAuth: readonly string[] = [],
): {
  servers: ServerInfo[];
  tools: ToolSummary[];
  serversRequiringAuth: string[];
} {
  if (!tenant) {
    return {
      servers: [...servers],
      tools: [...tools],
      serversRequiringAuth: [...serversRequiringAuth],
    };
  }
  const isOthersKey = (key: string) =>
    isOrganizationServerKey(key) && !key.startsWith(`${tenant}/`);
  const othersPrefixes = servers
    .filter(server => isOthersKey(server.name))
    .map(server => `${server.toolNamePrefix}_`);
  return {
    servers: servers.filter(server => !isOthersKey(server.name)),
    tools: tools.filter(
      tool =>
        !(tool.server && isOthersKey(tool.server)) &&
        !othersPrefixes.some(prefix => tool.name.startsWith(prefix)),
    ),
    serversRequiringAuth: serversRequiringAuth.filter(
      name => !isOthersKey(name),
    ),
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
  const {
    resources: crs,
    isLoading,
    errors,
  } = useResources(
    installation ? [installation] : [],
    MCPServer,
    {},
    { enabled: Boolean(installation) },
  );
  // Each with muster's key for it, read from muster.
  const resources = useMusterKeyedServers(crs);

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

/**
 * {@link useMusterServers} for several installations in one hook: each
 * installation's MCPServer CRs, read from the same cached per-installation
 * queries, for a list whose rows span installations. Keyed by installation;
 * an installation not asked for has no entry.
 */
export function useMusterServersByInstallation(
  installations: readonly string[],
): ReadonlyMap<string, MusterServers> {
  const {
    resources: crs,
    clustersData,
    errors,
    isLoading,
  } = useResources(
    [...installations],
    MCPServer,
    {},
    { enabled: installations.length > 0 },
  );
  // Each with muster's key for it, read from muster.
  const resources = useMusterKeyedServers(crs);

  return useMemo(() => {
    const byInstallation = new Map<string, MusterServers>();
    for (const installation of installations) {
      const own = resources.filter(
        resource => resource.cluster === installation,
      );
      const failed = errors.some(error => error.cluster === installation);
      const answered =
        failed || clustersData.some(data => data.cluster === installation);
      const servers = own.map(serverInfoOf);
      byInstallation.set(installation, {
        servers,
        resources: own,
        labels: connectorLabels(servers),
        isLoading: isLoading && !answered,
        isUnavailable: failed && own.length === 0,
      });
    }
    return byInstallation;
  }, [installations, resources, clustersData, errors, isLoading]);
}
