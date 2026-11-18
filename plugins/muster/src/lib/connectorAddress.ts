/**
 * A connector page's address below `/customize/connectors/<installation>/`,
 * the one rule every link to a connector page and every route that reads one
 * follow.
 *
 * - muster's own connector, a server family and muster itself:
 *   `<name>` (the CR name, the family name or `muster`).
 * - an organization's connector: `-/<namespace>/<name>`. Two organizations
 *   may each own a connector of one name, which the name alone does not tell
 *   apart. `-` is no Kubernetes name, the form skill pages use for a git
 *   host (`-/<host>/…`).
 *
 * A page key is that address as one string; {@link connectorPageParams}
 * turns it into the params of the route ref that builds it.
 */

/** The segment that starts an organization connector's address. */
export const ORGANIZATION_CONNECTOR_SEGMENT = '-';

const ORGANIZATION_PREFIX = `${ORGANIZATION_CONNECTOR_SEGMENT}/`;

/** A connector page's address, read from or for its route's params. */
export type ConnectorPageParams =
  /** `<installation>/<server>`: muster's own, a family or muster itself. */
  | { server: string; namespace?: undefined }
  /** `<installation>/-/<namespace>/<server>`: an organization's. */
  | { server: string; namespace: string };

/** The page key of an organization's connector, `-/<namespace>/<name>`. */
export function organizationConnectorPageKey(
  namespace: string,
  name: string,
): string {
  return `${ORGANIZATION_PREFIX}${namespace}/${name}`;
}

/** The page key of a connector page's params, as its route reads them. */
export function connectorPageKey(params: {
  server?: string;
  namespace?: string;
}): string {
  const server = params.server ?? '';
  return params.namespace
    ? organizationConnectorPageKey(params.namespace, server)
    : server;
}

/**
 * The params a page key's route ref takes: with `namespace` for an
 * organization's connector (the `-/<namespace>/<name>` route), without for
 * any other. A key that starts with `-/` but is not `-/<namespace>/<name>`
 * reads as a bare name, which no page has.
 */
export function connectorPageParams(key: string): ConnectorPageParams {
  if (key.startsWith(ORGANIZATION_PREFIX)) {
    const [namespace, server, ...rest] = key
      .slice(ORGANIZATION_PREFIX.length)
      .split('/');
    if (namespace && server && rest.length === 0) {
      return { namespace, server };
    }
  }
  return { server: key };
}

/** Whether a page key is an organization connector's address. */
export function isOrganizationConnectorPageKey(key: string): boolean {
  return connectorPageParams(key).namespace !== undefined;
}

/**
 * What a page key reads as where its connector is not (yet) read: the name,
 * or an organization's `<namespace>/<name>`, muster's key for it.
 */
export function connectorPageKeyLabel(key: string): string {
  const params = connectorPageParams(key);
  return params.namespace === undefined
    ? params.server
    : `${params.namespace}/${params.server}`;
}
