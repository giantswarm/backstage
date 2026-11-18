import type { ServerAuthStatus } from '../../apis/types';
import { MCPServer, mcpServerStateSeverity } from '../../lib/k8s';
import { signInServesOneSession } from '../../lib/serverAuthMode';
import type { ExplainedStatusText } from './hooks';

/** The few words of {@link portalOnlyStatus}, also its Connection bucket's. */
export const PORTAL_ONLY_LABEL = 'Portal only';

/**
 * Why a connector whose sign-in serves one muster session reads
 * {@link PORTAL_ONLY_LABEL}: the portal and each agent conversation are
 * sessions of their own.
 */
function portalOnlyExplanation(displayName: string): string {
  return `Your sign-in to ${displayName} covers this portal only. Each agent conversation asks you to sign in again.`;
}

/**
 * The state a connector shows in place of a plain "Connected" when the
 * person signed in to it in this muster session and that sign-in serves this
 * session only (`grantScope: session`, {@link signInServesOneSession}):
 * connected here, but not for their agents.
 *
 * Only on muster's word that this session is connected: without a report
 * (still loading, no muster session, no entry for the server) nobody signed
 * in, and any other report (a sign-in asked for, a connection that failed)
 * keeps its own state. Undefined then, and for a deactivated or unhealthy
 * server, so the Connectors list and the connector page decide it alike.
 */
export function portalOnlyStatus(
  server: MCPServer,
  displayName: string,
  authStatus?: ServerAuthStatus,
): ExplainedStatusText | undefined {
  if (
    authStatus?.status !== 'connected' ||
    server.getSuspended() ||
    mcpServerStateSeverity(server.getState()) !== 'ok' ||
    !signInServesOneSession(server, authStatus)
  ) {
    return undefined;
  }
  return {
    label: PORTAL_ONLY_LABEL,
    tone: 'warning',
    explanation: portalOnlyExplanation(displayName),
  };
}
