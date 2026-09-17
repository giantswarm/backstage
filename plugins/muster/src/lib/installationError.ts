import { isMusterAuthError, MUSTER_AUTH_PROMPT } from './authError';

/**
 * The MCP SDK's own words, written for a developer's log, not for the person
 * reading a page: `MCP HTTP Transport Error: POSTing to endpoint (HTTP 400):
 * mcp: session header is required for non-initialize requests`. The backend
 * maps these before they leave it; this recognises one that slipped through.
 */
const MCP_TRANSPORT_TEXT =
  /^MCP HTTP Transport Error|Attempted to send a request from a closed client|\bmcp: session\b/i;

export function isMcpTransportText(message: string): boolean {
  return MCP_TRANSPORT_TEXT.test(message);
}

/**
 * The line a page prints for an installation whose read failed. The backend's
 * plain words (`<installation> did not answer: <reason>`) already name the
 * installation and are printed as they are; a sign-in failure gets the muster
 * sign-in prompt; the SDK's transport text never reaches the person and reads
 * as "did not answer"; anything else is prefixed with the installation.
 */
export function installationErrorLine(
  installation: string,
  error: { message?: string } | string | null | undefined,
): string {
  const message = (typeof error === 'string' ? error : error?.message) ?? '';
  if (message.startsWith(`${installation} did not answer`)) {
    return message;
  }
  if (isMusterAuthError(error)) {
    return `${installation}: ${MUSTER_AUTH_PROMPT}`;
  }
  if (!message || isMcpTransportText(message)) {
    return `${installation} did not answer`;
  }
  return `${installation}: ${message}`;
}
