import { isOrganizationServer } from '../../lib/connectorKey';
import { isGitOpsManaged } from '../../lib/gitops';
import { wizardEditBlocker } from '../../lib/mcpServerDefinition';
import { ServerPageRow } from '../../lib/serverGrouping';

/** Why Edit is unavailable, by cause; the page's menu offers what fits each. */
export type ConnectorEditBlock = {
  cause: 'gitops' | 'instances' | 'organization' | 'session' | 'wizard';
  reason: string;
};

export const GITOPS_EDIT_REASON =
  'It is managed by GitOps, so change it in Git; a portal edit would be reverted. “Edit in Git…” in the menu shows where.';

export const GITOPS_FAMILY_EDIT_REASON =
  'It is managed by GitOps, so its instances are changed in Git, not here.';

export const INSTANCES_EDIT_REASON =
  'Each instance is configured on its own (see Instances).';

/**
 * Why an organization's connector is not edited here: muster's
 * `core_mcpserver_update` and `core_mcpserver_delete` change the connectors of
 * muster's own namespace only.
 */
export const ORGANIZATION_EDIT_REASON =
  "It belongs to its organization's namespace, where it is changed; Muster changes only its own connectors.";

/**
 * Why Edit and the tool settings are disabled when muster's review says the
 * person may not update the connector (`connectorAdmin: false`). Who can:
 * whoever may update MCPServers in muster's namespace; the portal knows no
 * names, so it says to ask one.
 */
export const NO_EDIT_RIGHTS_REASON =
  "You don't have rights to edit this connector. Ask a connector admin: someone who may update MCP servers in Muster's namespace.";

export const SESSION_EDIT_REASON =
  'Editing needs your Muster session, which is not connected.';

/** Why the connector page's menu is empty: its every action is a live write. */
export const SESSION_ACTIONS_REASON =
  'Reconnecting, turning off or removing needs your Muster session, which is not connected.';

/**
 * Why the connector page's Edit cannot open the connector wizard for `row`,
 * or undefined when it can. Mirrors what the wizard's edit gate
 * (NewMcpServerEditGate) accepts — one registered server the wizard can
 * represent, not applied from Git — plus the live muster session the save
 * runs through. Muster itself (`core`) has no Edit at all.
 */
export function connectorEditBlock(
  row: ServerPageRow,
  authenticated: boolean,
): ConnectorEditBlock | undefined {
  if (row.kind === 'family') {
    return row.servers.some(isGitOpsManaged)
      ? { cause: 'gitops', reason: GITOPS_FAMILY_EDIT_REASON }
      : { cause: 'instances', reason: INSTANCES_EDIT_REASON };
  }
  if (row.kind !== 'server') {
    return undefined;
  }
  if (isGitOpsManaged(row.server)) {
    return { cause: 'gitops', reason: GITOPS_EDIT_REASON };
  }
  if (isOrganizationServer(row.server)) {
    return { cause: 'organization', reason: ORGANIZATION_EDIT_REASON };
  }
  if (!authenticated) {
    return { cause: 'session', reason: SESSION_EDIT_REASON };
  }
  const blocker = wizardEditBlocker(row.server);
  return blocker ? { cause: 'wizard', reason: blocker } : undefined;
}
