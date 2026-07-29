import { A2aTaskWire } from './kagentTaskSchema';
import { readKagentMetadataString } from './kagentMetadata';
import {
  addTokenUsage,
  CONFIRMATION_TOOL_NAME,
  isAgentToolName,
  isFunctionCallPart,
  isFunctionResponsePart,
  isInternalToolName,
  isLongRunningPart,
  isThoughtPart,
  parseMessage,
  parsePart,
  readFunctionCall,
  readFunctionResponse,
  readNestedTokenUsage,
  readPartText,
  readTokenUsage,
  TokenUsage,
} from './kagentParts';

/** Fields every timeline item carries. */
type TimelineItemBase = {
  /** Stable React key, unique within a session. */
  id: string;
  /** RFC3339 when known; absent when neither the events nor the task had one. */
  at?: string;
  /**
   * Which agent emitted this, from `{adk,kagent}_author`. Worth showing when a
   * session involves several agents; usually the session's own agent.
   */
  author?: string;
  /** Index of the task this belongs to, so the UI can group by turn. */
  taskIndex: number;
};

export type TimelineItem =
  | (TimelineItemBase & { kind: 'user-message'; text: string })
  | (TimelineItemBase & { kind: 'agent-message'; text: string })
  | (TimelineItemBase & { kind: 'reasoning'; text: string })
  | (TimelineItemBase & {
      kind: 'tool-call';
      toolName: string;
      args?: unknown;
      /** The tool's result, once its `function_response` was seen. */
      result?: unknown;
      /** True when no response ever arrived — the call is the last we know. */
      isPending: boolean;
    })
  | (TimelineItemBase & {
      kind: 'agent-call';
      /** kagent's encoded agent id, e.g. `kagent__NS__sre_agent`. */
      agentId: string;
      args?: unknown;
      result?: unknown;
      isPending: boolean;
      /** The delegated agent's own token usage, when it reported any. */
      tokens?: TokenUsage;
    })
  | (TimelineItemBase & {
      kind: 'approval';
      /** The tool the agent proposed to run, when the payload named one. */
      toolName?: string;
      args?: unknown;
      /** Undefined while the request is still unanswered. */
      verdict?: 'approved' | 'rejected';
    });

export type SessionTimeline = {
  items: TimelineItem[];
  /** Total usage across the session, message-level plus delegated agents. */
  tokens: TokenUsage;
  /** Messages dropped because they could not be parsed at all. */
  skippedMessages: number;
};

/** A `tool-call`/`agent-call` item still waiting for its response. */
type OpenCall = { callId: string; itemIndex: number };

const EMPTY_USAGE: TokenUsage = { total: 0, prompt: 0, completion: 0 };

/**
 * Turn kagent's A2A tasks into a flat, renderable timeline.
 *
 * The shape of the input is worth stating, because it drives every decision here:
 * a session is a list of **tasks** (turns), each holding a `history` of A2A
 * **messages**, each holding **parts**. kagent discriminates a part's meaning via
 * `metadata.type` rather than the wire type, so classification lives in
 * `kagentParts.ts`.
 *
 * Choices that are not obvious:
 *
 * - **A tool call and its result are one item, not two.** The result is folded
 *   into the call it answers (matched on the function-call id), which is how the
 *   prototype renders it — collapsed shows the tool and its arguments, expanded
 *   adds the result. A response with no matching call still produces an item, so
 *   nothing is silently dropped.
 * - **Parts are walked in order**, with consecutive text of the same kind merged.
 *   kagent can put reasoning, prose and tool calls in a single message, and the
 *   order is the only record of what the agent did when.
 * - **Delegations to other agents are their own kind.** They read as tool calls
 *   on the wire, but a subagent run is a different thing to a user, and it is the
 *   only place a child agent's token usage appears.
 * - **Nothing throws.** A malformed message is counted in `skippedMessages` and
 *   the rest of the timeline renders.
 *
 * @param tasks - kagent's tasks, already in chronological order (it returns them
 *   `ORDER BY created_at ASC`).
 * @param timestamps - `messageId` → RFC3339, from the session's stored events.
 *   Optional: A2A messages carry no time of their own, so without this items fall
 *   back to their task's timestamp.
 */
export function buildTimeline(
  tasks: A2aTaskWire[],
  timestamps: Map<string, string> = new Map(),
): SessionTimeline {
  const items: TimelineItem[] = [];
  let tokens = EMPTY_USAGE;
  let skippedMessages = 0;

  // kagent's history can repeat a message across tasks (a resend or an
  // overlapping window), and rendering it twice would read as the agent saying
  // the same thing twice.
  const seenMessageIds = new Set<string>();

  tasks.forEach((task, taskIndex) => {
    const taskTimestamp = task.status?.timestamp;
    const history = Array.isArray(task.history) ? task.history : [];

    // Open calls are per task: a response never answers a call from another turn,
    // and letting them match across tasks would attach a result to the wrong call
    // when a tool is used repeatedly.
    const openCalls: OpenCall[] = [];
    // The approval awaiting a verdict. Only one can be open at a time — kagent
    // suspends the task until the user answers.
    let openApprovalIndex: number | undefined;

    history.forEach((entry, entryIndex) => {
      const message = parseMessage(entry);
      if (!message) {
        skippedMessages += 1;
        return;
      }

      if (message.messageId) {
        if (seenMessageIds.has(message.messageId)) {
          return;
        }
        seenMessageIds.add(message.messageId);
      }

      const at =
        (message.messageId ? timestamps.get(message.messageId) : undefined) ??
        taskTimestamp;
      const author = readKagentMetadataString(message.metadata, 'author');
      const isUser = message.role === 'user';

      // Usage is only counted for agent messages: kagent attributes a turn's
      // tokens to the agent's reply, and a user message carrying a usage bag
      // (some do) would double count the same turn.
      if (!isUser) {
        tokens = addTokenUsage(tokens, readTokenUsage(message.metadata));
      }

      const parts = Array.isArray(message.parts) ? message.parts : [];

      // A verdict arrives as a data part on a *user* message, and is shown on the
      // approval card rather than as a message of its own.
      if (isUser) {
        const decision = readDecision(parts);
        if (decision) {
          if (openApprovalIndex !== undefined) {
            const item = items[openApprovalIndex];
            // `verdict` may be undefined when the decision payload used a wording
            // we don't recognise. The approval is still resolved — we just can't
            // say which way, and guessing "approved" would assert consent.
            if (item?.kind === 'approval' && decision.verdict) {
              items[openApprovalIndex] = { ...item, verdict: decision.verdict };
            }
            openApprovalIndex = undefined;
          }
          return;
        }
      }

      // Text of the same kind is merged so a multi-part reply is one bubble, but a
      // switch between prose and reasoning (or a tool call in between) breaks the
      // run — that boundary is meaningful.
      let textRun: { isThought: boolean; chunks: string[] } | undefined;
      const flushText = () => {
        if (!textRun) {
          return;
        }
        const text = textRun.chunks.join('').trim();
        const wasThought = textRun.isThought;
        textRun = undefined;
        if (!text) {
          return;
        }
        // Reasoning is reasoning whoever emitted it; otherwise the role decides.
        let kind: 'reasoning' | 'user-message' | 'agent-message';
        if (wasThought) {
          kind = 'reasoning';
        } else if (isUser) {
          kind = 'user-message';
        } else {
          kind = 'agent-message';
        }

        items.push({
          id: `${taskIndex}:${entryIndex}:${items.length}`,
          at,
          author,
          taskIndex,
          kind,
          text,
        });
      };

      parts.forEach(rawPart => {
        const part = parsePart(rawPart);
        if (!part) {
          return;
        }

        const text = readPartText(part);
        if (text !== undefined) {
          const isThought = isThoughtPart(part);
          if (textRun && textRun.isThought !== isThought) {
            flushText();
          }
          textRun ??= { isThought, chunks: [] };
          textRun.chunks.push(text);
          return;
        }

        if (isFunctionResponsePart(part)) {
          flushText();
          const response = readFunctionResponse(part);
          const openIndex = response.id
            ? openCalls.findIndex(open => open.callId === response.id)
            : -1;

          if (openIndex >= 0) {
            const [open] = openCalls.splice(openIndex, 1);
            const item = items[open.itemIndex];
            if (item?.kind === 'tool-call') {
              items[open.itemIndex] = {
                ...item,
                result: response.response,
                isPending: false,
              };
            } else if (item?.kind === 'agent-call') {
              // A delegated agent reports its own usage inside the response,
              // because its messages live in its own session and never appear
              // here. This is the only place that cost surfaces.
              const nested = readNestedTokenUsage(response.response);
              items[open.itemIndex] = {
                ...item,
                result: response.response,
                isPending: false,
                tokens: nested,
              };
              // Keyed on the *item* kind, not `response.name`: the call is what
              // told us this was a delegation, and responses do not always repeat
              // the name. Keying on the response would silently drop the child's
              // tokens from the session total.
              tokens = addTokenUsage(tokens, nested);
            }
            return;
          }

          // An orphan response: its call was in a task we don't have, or the
          // payload carried no id. Still render it — a result with no visible
          // request is odd, but hiding it would be worse.
          if (isInternalToolName(response.name)) {
            return;
          }
          items.push(
            makeCallItem({
              id: `${taskIndex}:${entryIndex}:${items.length}`,
              at,
              author,
              taskIndex,
              name: response.name,
              args: undefined,
              result: response.response,
              isPending: false,
            }),
          );
          if (isAgentToolName(response.name)) {
            tokens = addTokenUsage(
              tokens,
              readNestedTokenUsage(response.response),
            );
          }
          return;
        }

        if (!isFunctionCallPart(part)) {
          // A file part, or something we have no renderer for. Silently ignored:
          // the timeline is about what the agent said and did, and an unknown part
          // type is not evidence of either.
          return;
        }

        flushText();
        const call = readFunctionCall(part);

        // An approval request is a long-running call to an internal tool, wrapping
        // the call the agent actually proposed.
        if (call.name === CONFIRMATION_TOOL_NAME && isLongRunningPart(part)) {
          const proposed = readProposedCall(call.args);
          openApprovalIndex = items.length;
          items.push({
            kind: 'approval',
            id: `${taskIndex}:${entryIndex}:${items.length}`,
            at,
            author,
            taskIndex,
            toolName: proposed?.name,
            args: proposed?.args,
          });
          return;
        }

        if (isInternalToolName(call.name)) {
          return;
        }

        const itemIndex = items.length;
        items.push(
          makeCallItem({
            id: `${taskIndex}:${entryIndex}:${itemIndex}`,
            at,
            author,
            taskIndex,
            name: call.name,
            args: call.args,
            result: undefined,
            isPending: true,
          }),
        );
        if (call.id) {
          openCalls.push({ callId: call.id, itemIndex });
        }
      });

      flushText();
    });
  });

  return { items, tokens, skippedMessages };
}

/** Build a `tool-call` or `agent-call` item depending on the tool name. */
function makeCallItem(input: {
  id: string;
  at?: string;
  author?: string;
  taskIndex: number;
  name: string | undefined;
  args: unknown;
  result: unknown;
  isPending: boolean;
}): TimelineItem {
  const { name, ...rest } = input;
  if (isAgentToolName(name)) {
    return {
      ...rest,
      kind: 'agent-call',
      agentId: name as string,
      tokens: readNestedTokenUsage(input.result),
    };
  }
  return {
    ...rest,
    kind: 'tool-call',
    // A call with no name is still activity worth showing; label it rather than
    // dropping the item.
    toolName: name ?? 'unknown tool',
  };
}

/**
 * The tool an approval request is asking about.
 *
 * kagent wraps it as `args.originalFunctionCall` on the `adk_request_confirmation`
 * call (`buildApprovalMessage` in kagent's UI reads the same field).
 */
function readProposedCall(
  args: unknown,
): { name?: string; args?: unknown } | undefined {
  if (!args || typeof args !== 'object') {
    return undefined;
  }
  const original = (args as { originalFunctionCall?: unknown })
    .originalFunctionCall;
  if (!original || typeof original !== 'object') {
    return undefined;
  }
  const record = original as { name?: unknown; args?: unknown };
  return {
    name: typeof record.name === 'string' ? record.name : undefined,
    args: record.args,
  };
}

/**
 * Whether this message is the user's answer to a pending approval, and which way.
 *
 * kagent marks a decision with `data.decision_type` on a data part of a *user*
 * message. It is either a uniform verdict applying to every pending call, or
 * `'batch'` with a per-call map.
 *
 * Returning an object means "this message is a decision" and so it must not also
 * render as user prose. A `verdict` of `undefined` inside that object means the
 * wording was one we don't recognise: the approval is resolved, but we decline to
 * say how. Defaulting to `'approved'` there would put words in the user's mouth
 * about an action they may have refused.
 */
function readDecision(
  parts: unknown[],
): { verdict?: 'approved' | 'rejected' } | undefined {
  for (const rawPart of parts) {
    const part = parsePart(rawPart);
    if (!part || !part.data || typeof part.data !== 'object') {
      continue;
    }
    const data = part.data as { decision_type?: unknown; decisions?: unknown };
    const decisionType = data.decision_type;
    if (typeof decisionType !== 'string' || decisionType === '') {
      continue;
    }

    // Only one approval is ever open — kagent suspends the task until it is
    // answered — so a batch decision collapses to "any rejection rejects".
    if (decisionType === 'batch') {
      const decisions = data.decisions;
      const values =
        decisions && typeof decisions === 'object'
          ? Object.values(decisions as Record<string, unknown>)
          : [];
      const verdicts = values
        .map(readVerdictWord)
        .filter((verdict): verdict is 'approved' | 'rejected' =>
          Boolean(verdict),
        );
      if (verdicts.length === 0) {
        return {};
      }
      return {
        verdict: verdicts.includes('rejected') ? 'rejected' : 'approved',
      };
    }

    return { verdict: readVerdictWord(decisionType) };
  }
  return undefined;
}

/**
 * kagent writes `'approve'` / `'reject'`. Accept the obvious variants
 * (`approved`, `rejected`) but nothing else — an unrecognised word yields no
 * verdict rather than a guessed one.
 */
function readVerdictWord(value: unknown): 'approved' | 'rejected' | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const word = value.toLowerCase();
  if (word.startsWith('reject')) {
    return 'rejected';
  }
  if (word.startsWith('approve')) {
    return 'approved';
  }
  return undefined;
}
