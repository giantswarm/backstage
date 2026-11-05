/**
 * The codes agent-manager's MCP tools prefix a refusal with (`<code>: <message>`):
 * an answer to the person's request, not a failure of the platform.
 *
 * - `not_found` -- the agent, release or file the request names does not exist.
 * - `invalid_request` -- a schema violation or an unpinnable skill, or an
 *   admission policy that denied the write.
 * - `conflict` -- an existing name or a suspended release.
 * - `gitops_owned` -- a live write to a release applied from git.
 * - `forbidden` -- the apiserver's refusal for the person (a viewer's Deploy).
 * - `unsupported` -- an operation this installation does not offer.
 *
 * The agent-platform frontend reads them into `AgentManagerError`; gs-node's
 * `MusterMcpClient` answers each with its 4xx, so they stay out of Sentry.
 */
export const AGENT_MANAGER_REFUSAL_CODES = [
  'not_found',
  'invalid_request',
  'conflict',
  'gitops_owned',
  'forbidden',
  'unsupported',
] as const;

export type AgentManagerRefusalCode =
  (typeof AGENT_MANAGER_REFUSAL_CODES)[number];

export function isAgentManagerRefusalCode(
  value: unknown,
): value is AgentManagerRefusalCode {
  return AGENT_MANAGER_REFUSAL_CODES.includes(value as AgentManagerRefusalCode);
}
