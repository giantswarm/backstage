import type { KagentSession } from './kagentSessions';
import { readMessageText } from './kagentParts';
import {
  isRuntimeLostFailureText,
  isRuntimeLostReason,
} from './kagentRuntimeLost';
import { FAILED_STATES } from './kagentSessionState';
import { A2aTaskWire } from './kagentTaskSchema';
import { readTurnStatus } from './kagentTurnStatus';

/**
 * Why a session failed, as a short class rather than the provider's words.
 *
 * The failure text is the provider's or the runtime's raw error — a URL, a
 * model id, a JSON body — so it never leaves the backend. What crosses the wire
 * is one of these, for a notification to say "the model was unavailable"
 * without quoting anything (agent session notifications, story 40):
 *
 * - `model-unavailable`: the model provider refused or failed the request (an
 *   unknown model, an overloaded or rate-limited provider, a missing key);
 * - `tool-failed`: a tool server the agent depends on could not be reached
 *   or listed (an MCP server, a remote agent used as a tool);
 * - `runtime-lost`: the session's runtime is gone and the session cannot go on
 *   (see `kagentRuntimeLost`);
 * - `other`: anything else, and anything the text does not say clearly. A
 *   failure is only given a specific class when the text matches a shape that
 *   kagent's own code produces; everything else is `other`.
 */
export const SESSION_FAILURE_REASONS = [
  'model-unavailable',
  'tool-failed',
  'runtime-lost',
  'other',
] as const;

export type SessionFailureReason = (typeof SESSION_FAILURE_REASONS)[number];

/**
 * A tool the agent depends on could not be reached. kagent's Go ADK wraps
 * these with the tool server's name (`failed to connect MCP client for
 * <name>: …`) and fails the turn; a tool *call* that errors does not fail the
 * turn, its error goes back to the model.
 */
const TOOL_FAILED_TEXTS: RegExp[] = [
  /\bfailed to (connect MCP client|create MCP toolset|list MCP tools) for\b/i,
  /\bfailed to (create remote A2A function tool|create A2A client|resolve agent card) for\b/i,
];

/**
 * The model provider failed the request. kagent's model clients prefix their
 * errors by provider; the Claude Harness passes Claude Code's `API Error: <n>`
 * through; the Python ADK raises LiteLLM's typed errors; Gemini answers
 * `Error <n>, Message: …`.
 */
const MODEL_UNAVAILABLE_TEXTS: RegExp[] = [
  /\bOpenAI (chat completion|responses) request failed\b/i,
  /\banthropic API error\b/i,
  /\bSAP AI Core (request failed|requires)\b/i,
  /\bno running orchestration deployment found in SAP AI Core\b/i,
  /\boperation error Bedrock Runtime\b/i,
  /\b[A-Z_]+_(API_KEY|ENDPOINT|DEPLOYMENT) environment variable is not set\b/,
  /\bAPI Error: [45]\d\d\b/,
  /\blitellm\.\w+Error\b/,
  /^Error [45]\d\d, Message: /m,
  /\b(model_not_found|overloaded_error|rate_limit_error|RESOURCE_EXHAUSTED)\b/,
];

/**
 * Classify a failure's text. Runtime loss is checked first: its words are the
 * runtime's own and say more than whatever the turn was doing when it went.
 * `other` for anything unmatched, and for no text at all.
 */
export function classifyFailureText(
  text: string | undefined,
): SessionFailureReason {
  if (!text) {
    return 'other';
  }
  if (isRuntimeLostFailureText(text)) {
    return 'runtime-lost';
  }
  if (TOOL_FAILED_TEXTS.some(pattern => pattern.test(text))) {
    return 'tool-failed';
  }
  if (MODEL_UNAVAILABLE_TEXTS.some(pattern => pattern.test(text))) {
    return 'model-unavailable';
  }
  return 'other';
}

/**
 * The failure class of a turn that failed (`failed` or `rejected`), from its
 * `status.message`; `undefined` for a turn that did not fail. A failed turn
 * with no readable message is `other`.
 */
export function readTaskFailureReason(
  task: A2aTaskWire,
): SessionFailureReason | undefined {
  const status = readTurnStatus(task);
  if (!status || !FAILED_STATES.has(status.state)) {
    return undefined;
  }
  if (status.message) {
    return classifyFailureText(readMessageText(status.message));
  }
  const raw = task.status?.message;
  return classifyFailureText(typeof raw === 'string' ? raw : undefined);
}

/**
 * The failure class of a session whose **instance** failed, from the
 * `Failure` kagent records on it: a lost runtime by its reason, anything else
 * by its message.
 */
export function readInstanceFailureReason(
  failure: KagentSession['failure'],
): SessionFailureReason {
  if (isRuntimeLostReason(failure?.reason)) {
    return 'runtime-lost';
  }
  return classifyFailureText(failure?.message);
}
