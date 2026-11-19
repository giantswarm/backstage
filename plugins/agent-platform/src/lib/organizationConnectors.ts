/**
 * An organization's own connectors as an agent binds them: the kagent
 * RemoteMCPServers of the organization namespace (`list_organization_connectors`),
 * which `create_agent` and `update_agent` take as `connectors` from
 * agent-manager 3.3 on. They are no muster servers: no toolset selector
 * reaches them, and the agent calls them with the credential the
 * organization stored for each, the same for everybody who uses the agent.
 */

import type { OrganizationConnector } from './organizations';

/**
 * What the Tools step and the review call them. Apart from the muster
 * servers of the organization's namespace, which the step's connector cards
 * mark "The organization's own connector": these are the ones the
 * organization page's Connectors tab lists.
 */
export const ORGANIZATION_CONNECTORS_LABEL =
  'Connectors from the organization page';

/**
 * Whether a write tool's input schema takes `connectors`: agent-manager
 * announces no capability for it, so its tool schema is what tells an
 * installation that takes them (3.3 and later) from one that does not.
 */
export function takesConnectors(
  inputSchema: { properties?: Record<string, unknown> } | undefined,
): boolean {
  return Object.hasOwn(inputSchema?.properties ?? {}, 'connectors');
}

/**
 * The first agent-manager whose `list_organization_connectors` marks an
 * agent's muster binding (`musterBindingOf`): the RemoteMCPServer the agent
 * chart renders for each agent, which the list returns beside the
 * organization's connectors and which agent-manager refuses as a connector.
 */
const MUSTER_BINDING_MARK_VERSION = '3.3.4';

/**
 * What Helm writes in `app.kubernetes.io/managed-by`. Before
 * {@link MUSTER_BINDING_MARK_VERSION} the list says nothing else about who
 * rendered an object, so there every Helm-rendered RemoteMCPServer counts as
 * a muster binding: a connector another chart renders too.
 */
const HELM_MANAGED_BY = 'Helm';

/** `major.minor.patch` and a pre-release, with or without a leading `v`. */
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(\+.*)?$/;

/**
 * Whether `version` is `minimum` or later, by semver precedence: a
 * pre-release comes before its release (`3.3.4-rc.1` before `3.3.4`). A
 * version that is no release version (`dev`, missing) is not.
 */
function versionAtLeast(version: string | undefined, minimum: string): boolean {
  const have = VERSION_PATTERN.exec(version ?? '');
  const want = VERSION_PATTERN.exec(minimum);
  if (!have || !want) return false;
  for (const part of [1, 2, 3]) {
    const difference = Number(have[part]) - Number(want[part]);
    if (difference !== 0) return difference > 0;
  }
  return !have[4];
}

/**
 * Whether the list marks the muster bindings: it comes from an agent-manager
 * of {@link MUSTER_BINDING_MARK_VERSION} or later (`get_info`'s `version`,
 * which a release build stamps), or a connector of it carries the mark. An
 * absent mark then means "no binding"; otherwise it means nothing.
 */
function marksMusterBindings(
  connectors: readonly OrganizationConnector[],
  agentManagerVersion: string | undefined,
): boolean {
  return (
    versionAtLeast(agentManagerVersion, MUSTER_BINDING_MARK_VERSION) ||
    connectors.some(connector => connector.musterBindingOf !== undefined)
  );
}

/**
 * The organization's own connectors among what `list_organization_connectors`
 * returns: not an agent's muster binding. The Connectors tab lists these and
 * the Tools step offers them, with the ones an agent has (`picked`) whatever
 * they are: an agent's own connector is never hidden from the person who
 * edits it. Where the list cannot mark the bindings (an agent-manager older
 * than {@link MUSTER_BINDING_MARK_VERSION}, or one whose version is no
 * release), every Helm-rendered one is left out, so a binding never shows as
 * a connector. A caller who may not list the namespace's Agents gets no mark
 * from agent-manager: the bindings then show, and agent-manager still
 * refuses one in `connectors`.
 */
export function organizationOwnConnectors(
  connectors: readonly OrganizationConnector[],
  agentManagerVersion: string | undefined,
  picked: readonly string[] = [],
): OrganizationConnector[] {
  const marked = marksMusterBindings(connectors, agentManagerVersion);
  return connectors.filter(
    connector =>
      picked.includes(connector.name) ||
      (marked
        ? !connector.musterBindingOf
        : connector.managedBy !== HELM_MANAGED_BY),
  );
}

/**
 * A connector's state as the Tools step says it. `ready`: kagent accepted it
 * and no credential is known to be missing. A credential the person may not
 * check (`unknown`) and a condition not reported yet say nothing either way.
 */
export type ConnectorReadiness = {
  ready: boolean;
  credentialMissing: boolean;
  notAccepted: boolean;
};

export function connectorReadiness(
  connector: OrganizationConnector,
): ConnectorReadiness {
  const credentialMissing = connector.credentials.some(
    credential => credential.state === 'missing',
  );
  const notAccepted = connector.accepted === false;
  return {
    ready: connector.accepted === true && !credentialMissing,
    credentialMissing,
    notAccepted,
  };
}

/**
 * agent-manager's refusals of an agent's connectors among the messages of a
 * dry run or a write, in its own words: `connectors: …`, and the coding
 * Harness's `extraTools: … connectors … need an agent on a kagent Harness`.
 */
export function connectorRefusalsOf(
  messages: readonly (string | undefined)[],
): string[] {
  return messages.filter(
    (message): message is string =>
      message !== undefined &&
      // A refused call may come with a prefix of the transport's.
      (/(^|\s)connectors:/.test(message) ||
        (/(^|\s)extraTools:/.test(message) &&
          message.includes(': connectors '))),
  );
}

/** Two lists of names alike, whatever their order. */
export function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}
