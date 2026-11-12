/**
 * The refusals of the Agent Platform's MCP servers: an answer to the person's
 * request, not a failure of the platform. The frontend reads them into each
 * server's error class; gs-node's `MusterMcpClient` answers each with its 4xx,
 * so they stay out of Sentry. One registry, so the two cannot drift apart.
 */

/** The MCP servers, as muster registers them, whose refusals are known. */
export const AGENT_MANAGER_SERVER = 'agent-manager';
export const MODEL_MANAGER_SERVER = 'model-manager';
export const WORKSPACE_MANAGER_SERVER = 'workspace-manager';

/**
 * The code a tool prefixes its error with (`<code>: <text>`), and the text
 * after it; undefined for an error without one. agent-manager and
 * model-manager word their errors this way.
 */
export function parseToolErrorCode(
  message: string,
): { code: string; text: string } | undefined {
  const match = /^([a-z_]+):\s*([\s\S]*)$/.exec(message);
  return match ? { code: match[1], text: match[2] } : undefined;
}

/**
 * agent-manager's refusals, by the code its tools prefix them with:
 *
 * - `not_found` -- the agent, release or file the request names does not exist.
 * - `invalid_request` -- a schema violation or an unpinnable skill, or an
 *   admission policy that denied the write.
 * - `conflict` -- an existing name or a suspended release.
 * - `gitops_owned` -- a live write to a release applied from git.
 * - `forbidden` -- the apiserver's refusal for the person (a viewer's Deploy).
 * - `unsupported` -- an operation this installation does not offer.
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

/**
 * model-manager's refusals, by the status word its tools prefix them with;
 * `does_not_fit` is the fit check's verdict on a model for a backend.
 */
export const MODEL_MANAGER_REFUSAL_CODES = [
  'not_found',
  'invalid_request',
  'conflict',
  'forbidden',
  'unsupported',
  'does_not_fit',
] as const;

export type ModelManagerRefusalCode =
  (typeof MODEL_MANAGER_REFUSAL_CODES)[number];

/**
 * workspace-manager's refusals, by their wording (`toolError` in its
 * internal/api): the operation, then the class. The `forbidden:` and
 * Kubernetes `is forbidden:` shapes are the membership refusals of its two
 * checks. The first that matches names the refusal.
 */
export const WORKSPACE_MANAGER_REFUSALS = [
  ['not_member', /: permission denied: /],
  ['not_member', /is not a member of Organization/],
  ['not_member', /\bis forbidden: User\b/],
  ['invalid', /: invalid workspace: /],
  ['invalid', /^invalid arguments: /],
  ['invalid', /^required argument /],
  ['invalid', /unknown provider/],
  ['invalid', /\bare required$/],
  ['not_found', /: not found: /],
  ['already_exists', /: already exists: /],
  ['conflict', /: the workspace changed since it was read/],
] as const satisfies ReadonlyArray<readonly [string, RegExp]>;

export type WorkspaceManagerRefusal =
  (typeof WORKSPACE_MANAGER_REFUSALS)[number][0];

/** Any known server's refusal. */
export type McpToolRefusal =
  AgentManagerRefusalCode | ModelManagerRefusalCode | WorkspaceManagerRefusal;

function codeIn<T extends string>(codes: readonly T[]) {
  return (message: string): T | undefined => {
    const code = parseToolErrorCode(message)?.code;
    return codes.includes(code as T) ? (code as T) : undefined;
  };
}

const REFUSALS_BY_SERVER = new Map<
  string,
  (message: string) => McpToolRefusal | undefined
>([
  [AGENT_MANAGER_SERVER, codeIn(AGENT_MANAGER_REFUSAL_CODES)],
  [MODEL_MANAGER_SERVER, codeIn(MODEL_MANAGER_REFUSAL_CODES)],
  [
    WORKSPACE_MANAGER_SERVER,
    message =>
      WORKSPACE_MANAGER_REFUSALS.find(([, pattern]) =>
        pattern.test(message),
      )?.[0],
  ],
]);

/**
 * The refusal a tool error of `server` is, or undefined: for a server whose
 * refusals are not known here, or an error that is none of them.
 */
export function mcpToolRefusalOf(
  server: string | undefined,
  message: string,
): McpToolRefusal | undefined {
  return server === undefined
    ? undefined
    : REFUSALS_BY_SERVER.get(server)?.(message);
}
