import type { ServerAuthStatus } from '../../apis/types';
import { MCPServer, mcpServerStateSeverity } from '../../lib/k8s';
import { signInServesOneSession } from '../../lib/serverAuthMode';
import type { StatusText } from './hooks';
import { isConnecting, isSsoRefused, needsSignIn } from './useServerSignIn';

/** A state with the sentence that says why, for a hint beside it. */
export type ExplainedStatusText = StatusText & { explanation: string };

/** The few words of {@link portalOnlyStatus}. */
export const PORTAL_ONLY_LABEL = 'Portal only';

/**
 * Why a connector whose sign-in serves one muster session reads
 * {@link PORTAL_ONLY_LABEL}: the portal and each agent conversation are
 * sessions of their own.
 */
export function portalOnlyExplanation(displayName: string): string {
  return `Your sign-in to ${displayName} covers this portal only. Each agent conversation asks you to sign in again.`;
}

/**
 * The state a connector shows in place of a plain "Connected" when the
 * person's sign-in to it serves one muster session (`grantScope: session`,
 * {@link signInServesOneSession}): connected here, but not for their agents.
 * Undefined wherever another state applies — deactivated, not healthy, or a
 * sign-in muster still asks of the person, is connecting or refused — so the
 * Connectors list and the connector page decide it the same way.
 */
export function portalOnlyStatus(
  server: MCPServer,
  displayName: string,
  authStatus?: ServerAuthStatus,
): ExplainedStatusText | undefined {
  if (
    server.getSuspended() ||
    mcpServerStateSeverity(server.getState()) !== 'ok'
  ) {
    return undefined;
  }
  if (
    authStatus &&
    (needsSignIn(authStatus) ||
      isConnecting(authStatus) ||
      isSsoRefused(authStatus))
  ) {
    return undefined;
  }
  if (!signInServesOneSession(server, authStatus)) {
    return undefined;
  }
  return {
    label: PORTAL_ONLY_LABEL,
    tone: 'warning',
    explanation: portalOnlyExplanation(displayName),
  };
}
