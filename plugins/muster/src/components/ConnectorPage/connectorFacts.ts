import type { McpUsage } from '../../apis';
import { MCPServer, mcpServerStateSeverity } from '../../lib/k8s';
import type { McpServerAuthMode } from '../../lib/mcpServerDefinition';
import { ServerAuthMode, serverAuthMode } from '../../lib/serverAuthMode';

/** How people reach a connector, in the shell's words. */
const SIGN_IN_LABELS: Record<ServerAuthMode, string> = {
  'platform-sso': 'Company login',
  'token-exchange': 'Company login',
  'own-account': 'Each person signs in with their own account',
  sigv4: 'AWS request signing',
  anonymous: 'No sign-in',
  unknown: 'Unrecognised sign-in',
};

export function signInLabel(server: MCPServer): string {
  return SIGN_IN_LABELS[serverAuthMode(server)];
}

/** The Settings tab's sign-in choices, by the wizard answer each registers. */
export const SIGN_IN_CHOICES: Record<McpServerAuthMode, string> = {
  'platform-sso': SIGN_IN_LABELS['platform-sso'],
  'own-account': SIGN_IN_LABELS['own-account'],
  none: SIGN_IN_LABELS.anonymous,
  sigv4: SIGN_IN_LABELS.sigv4,
};

/**
 * Whether a tool call reaches the server with the caller's own identity, so
 * "Runs as you" is true of it.
 */
export function runsAsCaller(server: MCPServer): boolean {
  const mode = serverAuthMode(server);
  return (
    mode === 'platform-sso' ||
    mode === 'token-exchange' ||
    mode === 'own-account'
  );
}

/** "2 of 2 instances healthy". */
export function healthLine(servers: MCPServer[]): string {
  const healthy = servers.filter(
    server =>
      !server.getSuspended() &&
      mcpServerStateSeverity(server.getState()) === 'ok',
  ).length;
  const noun = servers.length === 1 ? 'instance' : 'instances';
  return `${healthy} of ${servers.length} ${noun} healthy`;
}

/**
 * "3,418 · 0.4% errors": the calls muster dispatched to the connector over
 * the window its usage was read for (`useConnectorUsage`, narrowed to it).
 * Undefined where usage cannot be queried.
 */
export function callsLine(usage: McpUsage): string | undefined {
  if (!usage.available) {
    return undefined;
  }
  const { calls, errors } = usage.totals;
  const count = Math.round(calls).toLocaleString('en-US');
  // Rounded as the count is, and as the Usage tab decides "no calls": the
  // figures are `increase()` estimates, so 0.4 calls is none.
  if (Math.round(calls) === 0) {
    return count;
  }
  const ratio = (errors / calls) * 100;
  const percent =
    ratio === 0 || ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1);
  return `${count} · ${percent}% errors`;
}

/** When the oldest of `servers` was created, as "4 Aug 2026". */
export function addedLine(servers: MCPServer[]): string | undefined {
  const times = servers
    .map(server => server.getCreatedTimestamp())
    .filter((value): value is string => Boolean(value))
    .map(value => new Date(value))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (times.length === 0) {
    return undefined;
  }
  return times[0].toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
