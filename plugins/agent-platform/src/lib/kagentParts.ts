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
const INTERNAL_TOOL_NAMES = new Set(['adk_request_credential', 'ask_user']);

/** The tool name kagent uses for a human-in-the-loop approval request. */
export const CONFIRMATION_TOOL_NAME = 'adk_request_confirmation';

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

/** Parse one history entry, keeping only actual messages. */
export function parseMessage(item: unknown): A2aMessageWire | undefined {
  const parsed = a2aMessageWireSchema.safeParse(item);
  if (!parsed.success) {
    return undefined;
  }
  // `kind` distinguishes messages from other history entries. Absent `kind` is
  // treated as a message: older payloads omit it, and a history entry with parts
  // and a role is a message whatever it calls itself.
  if (parsed.data.kind && parsed.data.kind !== 'message') {
    return undefined;
  }
  return parsed.data;
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

/**
 * Whether a call is long-running, which is how kagent marks an approval request
 * apart from an ordinary call to the same internal tool.
 */
export function isLongRunningPart(part: A2aPartWire): boolean {
  return isKagentMetadataFlagSet(part.metadata, 'is_long_running');
}

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
 * counts rather than being discarded — a total with no breakdown is still worth
 * showing.
 */
export function readTokenUsage(metadata: unknown): TokenUsage | undefined {
  const usage = asRecord(readKagentMetadata(metadata, 'usage_metadata'));
  if (!usage) {
    return undefined;
  }
  const total = asNumber(usage.totalTokenCount);
  const prompt = asNumber(usage.promptTokenCount);
  const completion = asNumber(usage.candidatesTokenCount);
  if (total === 0 && prompt === 0 && completion === 0) {
    return undefined;
  }
  return { total, prompt, completion };
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
