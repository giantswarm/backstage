import { isGitOpsManaged } from '../../lib/gitops';
import { wizardEditBlocker } from '../../lib/mcpServerDefinition';
import { ServerPageRow } from '../../lib/serverGrouping';

/** Why Edit is unavailable, by cause; the page's menu offers what fits each. */
export type ConnectorEditBlock = {
  cause: 'gitops' | 'instances' | 'session' | 'wizard';
  reason: string;
};

export const GITOPS_EDIT_REASON =
  'Managed by GitOps: this connector is applied from a Git repository, so it is changed there — an edit made in the portal would be reverted. “Edit in Git…” in the menu shows where.';

export const GITOPS_FAMILY_EDIT_REASON =
  'Managed by GitOps: the instances of this connector are applied from a Git repository, so they are changed there, not in the portal.';

export const INSTANCES_EDIT_REASON =
  'A connector with several instances is not edited from this page: each instance is configured on its own (see Instances).';

export const SESSION_EDIT_REASON =
  'Editing runs through your muster session, which is not connected.';

/** Why the connector page's menu is empty: its every action is a live write. */
export const SESSION_ACTIONS_REASON =
  'Reconnecting, turning off or removing the connector runs through your muster session, which is not connected.';

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
  if (!authenticated) {
    return { cause: 'session', reason: SESSION_EDIT_REASON };
  }
  const blocker = wizardEditBlocker(row.server);
  return blocker ? { cause: 'wizard', reason: blocker } : undefined;
}
