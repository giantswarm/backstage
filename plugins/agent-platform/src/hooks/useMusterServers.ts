import { useMemo } from 'react';
import { useResources } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  MCPServer,
  type ToolSummary,
} from '@giantswarm/backstage-plugin-muster';

import { connectorLabels, type ServerInfo } from '../lib/toolset';

/**
 * The start of the namespaces whose MCPServers muster serves besides its
 * own (`TenantNamePrefix`, `ServedNamespace` in muster's
 * internal/api/mcpserver_namespace.go). muster's rule for which servers it
 * keys `<namespace>/<name>`, mirrored so the portal names them as muster
 * exposes them; it says nothing about which organization a namespace is.
 */
const MUSTER_TENANT_NAMESPACE_PREFIX = 'org-';

/** The separator of a server key outside muster's namespace. */
const SERVER_KEY_SEPARATOR = '/';

/**
 * The grouping's view of one MCPServer CR. muster keys a server of an
 * organization's namespace `<namespace>/<name>` (its tools' `server`, what
 * `server:` selects) and prefixes its tools `x_<namespace>_<segment>`; a
 * server of muster's own namespace keeps its name.
 */
export function serverInfoOf(server: MCPServer): ServerInfo {
  const displayName = server.getDisplayNameAnnotation();
  const icon = server.getStatusIcon();
  const namespace = server.getNamespace();
  const tenant = namespace?.startsWith(MUSTER_TENANT_NAMESPACE_PREFIX)
    ? namespace
    : '';
  const prefix = server.getToolNamePrefix();
  const tags = server.getTags();
  return {
    name: tenant
      ? `${tenant}${SERVER_KEY_SEPARATOR}${server.getName()}`
      : server.getName(),
    family: server.getFamily(),
    group: server.getToolGroupKey(),
    toolNamePrefix: tenant
      ? `x_${tenant}_${prefix.slice('x_'.length)}`
      : prefix,
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
 * The connectors an agent in `tenant` may be given, and their tools: muster's
 * own servers, for everyone, and the servers of the agent's own namespace;
 * another namespace's servers are its agents' only. Every server and tool
 * when no tenant is known. An organization's own RemoteMCPServers
 * (`list_organization_connectors`) are not muster servers: an agent's
 * toolset selects muster's, so they are not offered here.
 */
export function connectorsForTenant(
  servers: readonly ServerInfo[],
  tools: readonly ToolSummary[],
  tenant: string | undefined,
): { servers: ServerInfo[]; tools: ToolSummary[] } {
  if (!tenant) {
    return { servers: [...servers], tools: [...tools] };
  }
  const isOthers = (server: ServerInfo) =>
    server.name.includes(SERVER_KEY_SEPARATOR) &&
    !server.name.startsWith(`${tenant}${SERVER_KEY_SEPARATOR}`);
  const othersPrefixes = servers
    .filter(isOthers)
    .map(server => `${server.toolNamePrefix}_`);
  return {
    servers: servers.filter(server => !isOthers(server)),
    tools: tools.filter(
      tool => !othersPrefixes.some(prefix => tool.name.startsWith(prefix)),
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

/**
 * {@link useMusterServers} for several installations in one hook: each
 * installation's MCPServer CRs, read from the same cached per-installation
 * queries, for a list whose rows span installations. Keyed by installation;
 * an installation not asked for has no entry.
 */
export function useMusterServersByInstallation(
  installations: readonly string[],
): ReadonlyMap<string, MusterServers> {
  const { resources, clustersData, errors, isLoading } = useResources(
    [...installations],
    MCPServer,
    {},
    { enabled: installations.length > 0 },
  );

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
