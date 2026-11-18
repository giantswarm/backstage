import type { MCPServer } from './k8s';
import { MUSTER_NAMESPACE } from './musterNamespace';

/**
 * muster's key for a server on its installation (`MCPServerKey` in muster's
 * internal/api/mcpserver_namespace.go): its name in muster's namespace,
 * `<namespace>/<name>` in any other, an organization's. Unique on one
 * installation, where two organizations may each own a server of the same
 * name. What `auth://status`, a tool's `server`, `server:` selectors and the
 * usage metrics name a server by.
 */
export function connectorAuthName(server: MCPServer): string {
  return isOrganizationServer(server)
    ? `${server.getNamespace()}/${server.getName()}`
    : server.getName();
}

/** Whether a server lives outside muster's namespace: an organization's. */
export function isOrganizationServer(server: MCPServer): boolean {
  const namespace = server.getNamespace();
  return Boolean(namespace) && namespace !== MUSTER_NAMESPACE;
}

/**
 * The prefix muster gives a server's tools (`MCPServerExposedPrefix`): an
 * organization's server's carry its namespace, `x_<namespace>_<segment>`,
 * since it joins no family; muster's own, `MCPServer.getToolNamePrefix`.
 */
export function connectorToolNamePrefix(server: MCPServer): string {
  return isOrganizationServer(server)
    ? `x_${server.getNamespace()}_${server.getToolPrefix() ?? server.getName()}`
    : server.getToolNamePrefix();
}
