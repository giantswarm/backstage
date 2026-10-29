import type { KagentSession } from './kagentSessions';
import {
  isRuntimeLostFailureText,
  isRuntimeLostReason,
  readFailedTaskReason,
} from './kagentRuntimeLost';
import { describeSessionState, FAILED_STATES } from './kagentSessionState';
import { A2aTaskWire } from './kagentTaskSchema';

/**
 * Why a session failed, as a short class rather than the provider's words.
 *
 * The failure text is the provider's or the runtime's raw error — a URL, a
 * model id, a JSON body — so it never leaves the backend. What crosses the wire
 * is one of these, for a notification to say "the model was unavailable"
 * without quoting anything (agent session notifications, story 40):
 *
 * - `model-unavailable`: the model cannot be had (an unknown model, a
 *   refused key, an overloaded, rate-limited or failing provider, a missing
 *   key). Not a request the provider rejected as wrong, such as a
 *   conversation that outgrew the context window: that is `other`;
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
 * The words of a model provider's error, by source: kagent's model clients
 * prefix their errors by provider, the Claude Harness passes Claude Code's
 * `API Error: <n>` through, and Gemini answers `Error <n>, Message: …`. They
 * say who answered, not why: the same prefixes carry a prompt that outgrew the
 * context window, so they count only together with one of the
 * {@link UNAVAILABLE_SIGNALS}.
 */
const MODEL_PROVIDER_TEXTS: RegExp[] = [
  /\bOpenAI (chat completion|responses) request failed\b/i,
  /\banthropic API error\b/i,
  /\bSAP AI Core request failed\b/i,
  /\boperation error Bedrock Runtime\b/i,
  /\bAPI Error: \d{3}\b/,
  /^Error \d{3}, Message: /m,
];

/**
 * A provider's answer that means the model cannot be had right now or by
 * this agent: unauthorised, forbidden, not found, timed out, rate-limited, or
 * the provider failing. A 400 is not one: the request was wrong, not the
 * model unavailable.
 */
const UNAVAILABLE_SIGNALS: RegExp[] = [
  /\b(401|403|404|408|429|5\d\d)\b/,
  /\b(Unauthorized|Forbidden|Not Found|Too Many Requests|Service Unavailable|Bad Gateway|Gateway Timeout|Overloaded|ThrottlingException)\b/i,
];

/**
 * The model is unavailable whoever says so: a missing provider key or
 * endpoint, an SAP AI Core without a deployment, LiteLLM's typed errors for
 * unavailability (the Python ADK), or the providers' own error codes for it.
 */
const MODEL_UNAVAILABLE_TEXTS: RegExp[] = [
  /\b[A-Z_]+_(API_KEY|ENDPOINT|DEPLOYMENT) environment variable is not set\b/,
  /\bSAP AI Core requires\b/,
  /\bno running orchestration deployment found in SAP AI Core\b/i,
  /\blitellm\.(RateLimit|NotFound|Authentication|PermissionDenied|ServiceUnavailable|InternalServer|APIConnection|Timeout)Error\b/,
  /\b(model_not_found|overloaded_error|rate_limit_error|RESOURCE_EXHAUSTED)\b/,
];

/**
 * The request was wrong rather than the model unavailable: the conversation
 * outgrew the context window, or the provider refused the content. These are
 * `other` whatever else the text says, since the way out is a new session or
 * a different request, not waiting for the model.
 */
const REQUEST_REJECTED_TEXTS: RegExp[] = [
  /\b(context_length_exceeded|ContextWindowExceeded\w*|content_policy\w*|ContentPolicyViolation\w*)\b/,
  /\b(prompt|input) is too long\b/i,
  /\bmaximum context length\b/i,
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
  if (REQUEST_REJECTED_TEXTS.some(pattern => pattern.test(text))) {
    return 'other';
  }
  if (
    MODEL_UNAVAILABLE_TEXTS.some(pattern => pattern.test(text)) ||
    (MODEL_PROVIDER_TEXTS.some(pattern => pattern.test(text)) &&
      UNAVAILABLE_SIGNALS.some(pattern => pattern.test(text)))
  ) {
    return 'model-unavailable';
  }
  return 'other';
}

/**
 * The failure class of a turn that failed (`failed` or `rejected`), from its
 * `status.message`, read as the session page reads it (`readFailedTaskReason`);
 * `undefined` for a turn that did not fail. A failed turn with no readable
 * message is `other`.
 */
export function readTaskFailureReason(
  task: A2aTaskWire,
): SessionFailureReason | undefined {
  const state = describeSessionState(task.status?.state)?.key;
  if (!state || !FAILED_STATES.has(state)) {
    return undefined;
  }
  return classifyFailureText(readFailedTaskReason(task));
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
