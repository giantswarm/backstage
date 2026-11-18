import type { MCPServer } from './k8s';
import { MUSTER_NAMESPACE } from './musterNamespace';

/** The separator of a key outside muster's namespace (`mcpServerKeySeparator`). */
const KEY_SEPARATOR = '/';

/**
 * Whether muster's key names a server outside its own namespace, keyed
 * `<namespace>/<name>`: an organization's.
 */
export function isOrganizationServerKey(key: string): boolean {
  return key.includes(KEY_SEPARATOR);
}

/**
 * muster's key for a server (`MCPServerKey` in muster's
 * internal/api/mcpserver_namespace.go): its name in muster's namespace,
 * `<namespace>/<name>` in any other.
 */
function serverKey(
  namespace: string | undefined,
  name: string,
  musterNamespace: string,
): string {
  return !namespace || namespace === musterNamespace
    ? name
    : `${namespace}${KEY_SEPARATOR}${name}`;
}

/**
 * muster's key for a server on its installation: what `auth://status`, a
 * tool's `server`, `server:` selectors, the usage metrics and the
 * `core_service_*` tools name it by. Unique on one installation, where two
 * organizations may each own a server of the same name.
 *
 * Read from muster's own answer where the server carries it
 * ({@link withMusterKeys}); until muster answered, worked out against the
 * namespace the agent-platform chart installs muster in.
 */
export function connectorAuthName(server: MCPServer): string {
  return (
    server.getMusterKey() ??
    serverKey(server.getNamespace(), server.getName(), MUSTER_NAMESPACE)
  );
}

/** Whether a server lives outside muster's namespace: an organization's. */
export function isOrganizationServer(server: MCPServer): boolean {
  return isOrganizationServerKey(connectorAuthName(server));
}

/**
 * The prefix muster gives a server's tools (`MCPServerExposedPrefix`): an
 * organization's server's carry its namespace, `x_<namespace>_<segment>`,
 * since it joins no family; muster's own, `MCPServer.getToolNamePrefix`.
 * An empty `toolPrefix` counts as none, as in muster.
 */
export function connectorToolNamePrefix(server: MCPServer): string {
  return isOrganizationServer(server)
    ? `x_${server.getNamespace()}_${server.getToolPrefix() || server.getName()}`
    : server.getToolNamePrefix();
}

/**
 * The namespace muster runs in, from the keys it names its servers by
 * (`names`, its `/servers/names` answer for the installation of `servers`):
 * the namespace of the servers it names by their bare name, where muster
 * does not name them `<namespace>/<name>`; the most common one, should a
 * server of another namespace share such a name. Undefined when muster names
 * none of them.
 */
export function musterNamespaceOf(
  servers: readonly MCPServer[],
  names: ReadonlySet<string>,
): string | undefined {
  const votes = new Map<string, number>();
  for (const server of servers) {
    const namespace = server.getNamespace();
    if (
      namespace &&
      names.has(server.getName()) &&
      !names.has(`${namespace}${KEY_SEPARATOR}${server.getName()}`)
    ) {
      votes.set(namespace, (votes.get(namespace) ?? 0) + 1);
    }
  }
  return [...votes].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0]?.[0];
}

/**
 * The servers, each with muster's key for it, from the keys muster names an
 * installation's servers by (`namesOf`, its `/servers/names` answer): the
 * rule of `MCPServerKey` against the namespace muster answers from
 * ({@link musterNamespaceOf}), so a muster outside the chart's namespace
 * keeps working. A server of an installation whose muster has not answered,
 * or names none of its servers, keeps the rule {@link connectorAuthName}
 * falls back to.
 */
export function withMusterKeys(
  servers: readonly MCPServer[],
  namesOf: (installation: string) => ReadonlySet<string> | undefined,
): MCPServer[] {
  const namespaces = new Map<string, string | undefined>();
  const musterNamespace = (
    installation: string,
    names: ReadonlySet<string>,
  ) => {
    if (!namespaces.has(installation)) {
      namespaces.set(
        installation,
        musterNamespaceOf(
          servers.filter(server => server.cluster === installation),
          names,
        ),
      );
    }
    return namespaces.get(installation);
  };
  return servers.map(server => {
    const names = namesOf(server.cluster);
    const own = names && musterNamespace(server.cluster, names);
    return own
      ? server.withMusterKey(
          serverKey(server.getNamespace(), server.getName(), own),
        )
      : server;
  });
}
