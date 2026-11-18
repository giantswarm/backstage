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
 * What Helm writes in `app.kubernetes.io/managed-by`: the agent chart renders
 * each agent's muster binding as a RemoteMCPServer of the agent's namespace,
 * which the list returns too. agent-manager refuses it as a connector, so it
 * is not offered. The list does not say which chart rendered an object, so a
 * connector another Helm chart renders is not offered either, until
 * agent-manager marks the muster bindings itself.
 */
const AGENT_CHART_MANAGED_BY = 'Helm';

/**
 * The connectors an agent of the organization may be given, and the ones it
 * has (`picked`) whatever renders them: an agent's own connector is never
 * hidden from the person who edits it.
 */
export function offerableConnectors(
  connectors: readonly OrganizationConnector[],
  picked: readonly string[] = [],
): OrganizationConnector[] {
  return connectors.filter(
    connector =>
      connector.managedBy !== AGENT_CHART_MANAGED_BY ||
      picked.includes(connector.name),
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
