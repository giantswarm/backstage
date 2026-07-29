import {
  a2aPartWireSchema,
  A2aPartWire,
  a2aMessageWireSchema,
  A2aMessageWire,
} from './kagentTaskSchema';
import {
  isKagentMetadataFlagSet,
  readKagentMetadata,
  readKagentMetadataString,
} from './kagentMetadata';

/**
 * Primitives for reading A2A message parts the way kagent writes them.
 *
 * kagent packs several distinct things into the same `DataPart` shape and
 * discriminates via the part's `metadata.type`, so classification is a handful
 * of small predicates rather than a discriminated union on the wire. Kept in one
 * place because both the timeline and the token summary need them.
 *
 * Every function here tolerates arbitrary input: this layer is reached with
 * whatever kagent sent.
 */

/** kagent's separator for an agent reference encoded as a python identifier. */
const AGENT_NAMESPACE_SEPARATOR = '__NS__';

/**
 * ADK-internal tool calls that are plumbing, not agent activity.
 *
 * kagent's own UI hides these too (`extractToolCallRequests`): a credential
 * request is an auth handshake, and `ask_user` is rendered by the approval path
 * rather than as a tool call. Showing them would be noise indistinguishable from
 * real work.
 */
/**
 * ADK's tool for asking the user a question.
 *
 * Arrives wrapped in a confirmation request like an approval does, but it asks for
 * an *answer*, not permission — so it reads quite differently, and kagent's own UI
 * branches on this name for the same reason (`buildApprovalMessage`).
 */
export const ASK_USER_TOOL_NAME = 'ask_user';

const INTERNAL_TOOL_NAMES = new Set([
  'adk_request_credential',
  ASK_USER_TOOL_NAME,
]);

/** The tool name kagent uses for a human-in-the-loop confirmation request. */
export const CONFIRMATION_TOOL_NAME = 'adk_request_confirmation';

/**
 * muster's proxy tool. Agents reach most MCP tools through it, so the tool a call
 * *appears* to make is almost always this one.
 */
export const MUSTER_PROXY_TOOL_NAME = 'call_tool';

/** What the UI shows as the origin of a proxied call — the product name. */
export const MUSTER_PROXY_LABEL = 'Muster';

/**
 * Look through muster's `call_tool` wrapper to the tool actually invoked.
 *
 * Agents call most MCP tools via muster, so without this every row reads
 * `call_tool` and the real tool is buried in the arguments:
 *
 * ```
 * call_tool  arguments: {…}, name: x_kubernetes_get
 * ```
 *
 * which makes a run of calls impossible to scan — the problem reported in
 * giantswarm/klaus-gateway#163 for the Slack surface. Unwrapped, the row names
 * `x_kubernetes_get` and carries `via: 'muster'`.
 *
 * Only unwraps when the payload actually has the wrapper's shape (`name` a
 * non-empty string, with the inner call's `arguments`). Anything else is returned
 * untouched, so a future change to `call_tool` degrades to showing the wrapper
 * rather than losing the call.
 */
export function unwrapProxiedCall(call: FunctionCall): FunctionCall & {
  /** Set when the call reached its tool through a proxy. */
  via?: string;
} {
  if (call.name !== MUSTER_PROXY_TOOL_NAME) {
    return call;
  }
  const args = asRecord(call.args);
  const innerName = asNonEmptyString(args?.name);
  if (!innerName) {
    return call;
  }
  return {
    id: call.id,
    name: innerName,
    args: args?.arguments,
    via: MUSTER_PROXY_LABEL,
  };
}

export type FunctionCall = {
  /** Correlates a call with its response; absent on malformed payloads. */
  id?: string;
  name?: string;
  args?: unknown;
};

export type FunctionResponse = {
  id?: string;
  name?: string;
  response?: unknown;
};

export type TokenUsage = {
  total: number;
  prompt: number;
  completion: number;
};

/** Parse one part, or `undefined` when it is not an object at all. */
export function parsePart(part: unknown): A2aPartWire | undefined {
  const parsed = a2aPartWireSchema.safeParse(part);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The three things a history entry can turn out to be.
 *
 * `'other'` and `'unparseable'` are kept apart on purpose. A history entry whose
 * `kind` is `artifact-update` or a status update is a perfectly healthy part of a
 * session that we simply have no renderer for — counting it as data loss would
 * make the UI warn "N messages could not be read" about a sound session. Only a
 * schema failure is actual loss.
 */
export type ParsedHistoryEntry =
  | { kind: 'message'; message: A2aMessageWire }
  | { kind: 'other' }
  | { kind: 'unparseable' };

/** Classify one history entry. */
export function parseHistoryEntry(item: unknown): ParsedHistoryEntry {
  const parsed = a2aMessageWireSchema.safeParse(item);
  if (!parsed.success) {
    return { kind: 'unparseable' };
  }
  // `kind` distinguishes messages from other history entries. Absent `kind` is
  // treated as a message: older payloads omit it, and a history entry with parts
  // and a role is a message whatever it calls itself.
  if (parsed.data.kind && parsed.data.kind !== 'message') {
    return { kind: 'other' };
  }
  return { kind: 'message', message: parsed.data };
}

/**
 * Text carried by a part, or undefined when it has none.
 *
 * Does not check `kind`: a part with text is a text part regardless of what it
 * labels itself, which is one less thing a rename can break.
 */
export function readPartText(part: A2aPartWire): string | undefined {
  return part.text;
}

/**
 * Whether a text part is the model's *reasoning* rather than its answer.
 *
 * kagent's ADK bridge sets this when converting a Gemini/Anthropic thinking
 * block: `a2a_part.metadata = {get_kagent_metadata_key("thought"): part.thought}`
 * (`python/packages/kagent-adk/src/kagent/adk/converters/part_converter.py`).
 */
export function isThoughtPart(part: A2aPartWire): boolean {
  return isKagentMetadataFlagSet(part.metadata, 'thought');
}

/** Whether a data part is a tool call request. */
export function isFunctionCallPart(part: A2aPartWire): boolean {
  return readKagentMetadataString(part.metadata, 'type') === 'function_call';
}

/** Whether a data part is a tool call result. */
export function isFunctionResponsePart(part: A2aPartWire): boolean {
  return (
    readKagentMetadataString(part.metadata, 'type') === 'function_response'
  );
}

// There is deliberately no `isLongRunningPart` helper. kagent marks a
// confirmation call with `{adk,kagent}_is_long_running: true` and its own UI
// checks it, but the timeline discriminates approvals on the tool *name* alone:
// a missing flag, or one arriving as the string `"true"`, would otherwise
// downgrade an approval into a raw tool call exposing ADK's internal wrapper.

/** Read `{id, name, args}` out of a `function_call` data part. */
export function readFunctionCall(part: A2aPartWire): FunctionCall {
  const data = asRecord(part.data);
  return {
    id: asNonEmptyString(data?.id),
    name: asNonEmptyString(data?.name),
    args: data?.args,
  };
}

/** Read `{id, name, response}` out of a `function_response` data part. */
export function readFunctionResponse(part: A2aPartWire): FunctionResponse {
  const data = asRecord(part.data);
  return {
    id: asNonEmptyString(data?.id),
    name: asNonEmptyString(data?.name),
    response: data?.response,
  };
}

/**
 * Whether a tool name refers to another agent rather than a plain tool.
 *
 * kagent encodes an agent reference as a python identifier (`ns/name` →
 * `ns__NS__name`), so the separator is the tell — the same check kagent's UI
 * makes (`isAgentToolName`).
 */
export function isAgentToolName(name: string | undefined): boolean {
  return typeof name === 'string' && name.includes(AGENT_NAMESPACE_SEPARATOR);
}

/** Whether a tool call is ADK plumbing we deliberately hide. */
export function isInternalToolName(name: string | undefined): boolean {
  return typeof name === 'string' && INTERNAL_TOOL_NAMES.has(name);
}

/**
 * Token usage from a metadata bag, under either prefix.
 *
 * The field names are Gemini's (`promptTokenCount` / `candidatesTokenCount`),
 * which is what ADK passes through. A partial bag yields zeros for the missing
 * counts rather than being discarded — a breakdown with no total, or a total with
 * no breakdown, is still worth showing.
 *
 * **`totalTokenCount` is derived when kagent doesn't report one.** Confirmed on a
 * real gazelle session, whose every message carried exactly
 * `adk_usage_metadata: {promptTokenCount, candidatesTokenCount}` — no
 * `totalTokenCount` at all. Summing the reported totals therefore gave "Total 0"
 * next to 1.4M input, which reads as broken. kagent's own UI has the same hole
 * (`total: usage.totalTokenCount ?? 0`).
 *
 * The reported total still wins when present: it can legitimately exceed
 * prompt + completion, because a model that bills thinking tokens separately
 * counts them in the total but in neither part.
 */
export function readTokenUsage(metadata: unknown): TokenUsage | undefined {
  const usage = asRecord(readKagentMetadata(metadata, 'usage_metadata'));
  if (!usage) {
    return undefined;
  }
  const reportedTotal = asNumber(usage.totalTokenCount);
  const prompt = asNumber(usage.promptTokenCount);
  const completion = asNumber(usage.candidatesTokenCount);
  if (reportedTotal === 0 && prompt === 0 && completion === 0) {
    return undefined;
  }
  return {
    total: reportedTotal > 0 ? reportedTotal : prompt + completion,
    prompt,
    completion,
  };
}

/**
 * A delegated agent's own usage, which rides inside the tool *response* rather
 * than in message metadata.
 *
 * A subagent runs in its own session, so its messages are not in this session's
 * tasks — the parent only ever sees the response. Counting this is therefore not
 * double counting; it is the only place the child's cost appears here.
 *
 * The response object is keyed exactly like a metadata bag
 * (`kagent_usage_metadata`), so {@link readTokenUsage} reads it as-is. This
 * wrapper exists to name the distinction at the call site, not to add logic.
 */
export const readNestedTokenUsage = readTokenUsage;

export function addTokenUsage(
  left: TokenUsage,
  right: TokenUsage | undefined,
): TokenUsage {
  if (!right) {
    return left;
  }
  return {
    total: left.total + right.total,
    prompt: left.prompt + right.prompt,
    completion: left.completion + right.completion,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
