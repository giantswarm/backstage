import { A2aTaskWire } from './kagentTaskSchema';
import { readKagentMetadataString } from './kagentMetadata';
import { normalizeTimestamp } from './kagentSessions';
import {
  addTokenUsage,
  ASK_USER_TOOL_NAME,
  CONFIRMATION_TOOL_NAME,
  isAgentToolName,
  isFunctionCallPart,
  isFunctionResponsePart,
  isInternalToolName,
  isThoughtPart,
  parseHistoryEntry,
  parsePart,
  readFunctionCall,
  readFunctionResponse,
  readNestedTokenUsage,
  readPartText,
  readTokenUsage,
  TokenUsage,
  unwrapProxiedCall,
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
      /**
       * The tool actually invoked. For a call made through muster's `call_tool`
       * this is the **inner** tool, not the proxy — see `unwrapProxiedCall`.
       */
      toolName: string;
      /** The proxy the call travelled through, when it went through one. */
      via?: string;
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
      /**
       * What the agent actually asked for.
       *
       * ADK wraps both in the same confirmation request, but they read completely
       * differently: `'approval'` is "may I run this tool", `'input'` is a question
       * put to the user via `ask_user`. Discriminated here rather than by the UI
       * matching on a tool name, and kagent's own UI branches at the same point.
       */
      asks: 'approval' | 'input';
      /** The tool the agent proposed to run, when the payload named one. */
      toolName?: string;
      /**
       * The questions themselves, when this is an `ask_user`.
       *
       * Extracted here rather than left for the UI to dig out of {@link args},
       * because a question is the last thing the agent *said* — it belongs in the
       * conversation as prose, not behind an expander as JSON. Empty when the
       * payload used a shape we don't recognise, in which case the raw args remain
       * the only record and the UI falls back to showing them.
       */
      questions?: string[];
      args?: unknown;
      /** Undefined while the request is still unanswered. */
      verdict?: 'approved' | 'rejected';
    });

export type SessionTimeline = {
  items: TimelineItem[];
  /** Total usage across the session, message-level plus delegated agents. */
  tokens: TokenUsage;
  /**
   * History entries that failed to parse at all — genuine data loss, safe for the
   * UI to report as "N messages could not be read".
   *
   * Deliberately **excludes** well-formed entries that simply aren't messages
   * (artifact and status updates), which are a normal part of a healthy session.
   * Counting those would make the UI warn about sessions that are perfectly fine.
   */
  skippedMessages: number;
};

/** A `tool-call`/`agent-call` item still waiting for its response. */
type OpenCall = { callId: string; itemIndex: number };

const EMPTY_USAGE: TokenUsage = { total: 0, prompt: 0, completion: 0 };

/**
 * The A2A states in which `status.message` is a prompt the task is *waiting on*,
 * rather than incidental status text.
 *
 * The legacy (v0) spellings, which is what this client reads: `listSessionTasks`
 * deliberately sends no `A2A-Version` header, and kagent treats a missing header
 * as the legacy wire.
 */
const AWAITING_INPUT_STATES = new Set(['input-required', 'auth-required']);

/**
 * A task's history, plus the question it is currently waiting on.
 *
 * kagent puts an *unanswered* confirmation on `task.status.message` and **not** in
 * `history`, so a session that ends by asking the user something rendered as if
 * the agent had simply stopped talking. The raw `ask_user` call does appear in
 * history, but it is deliberately skipped as ADK plumbing (`INTERNAL_TOOL_NAMES`)
 * because the approval path is supposed to render it — and that path only ever
 * looked at history. The question fell between the two.
 *
 * Verified against a live gazelle session: the pending `status.message` carries a
 * distinct `messageId` that appears nowhere in `history`, wrapping the question in
 * the same `adk_request_confirmation` shape an answered one has. So appending it
 * as a final entry gets the existing approval handling — including the
 * `ask_user` -> `asks: 'input'` discrimination — for free.
 *
 * Gated on the state rather than merely on the message being present. Two reasons:
 * it is the documented contract (`status.message` "carries the pending prompt
 * while a task waits for input"), and it makes the item self-clearing — once the
 * user answers elsewhere and the task reaches a terminal state, the prompt stops
 * being emitted here and the answered confirmation renders from history instead,
 * so the card cannot linger as a question that has already been answered.
 *
 * kagent's own UI splits the same problem across two passes
 * (`extractMessagesFromTasks` skips unresolved confirmations in history;
 * `extractApprovalMessagesFromTasks` reads `status.message`). One list keeps the
 * question in its chronological place instead of appending it to the end.
 *
 * Only an object-shaped message is appended. `status.message` is `z.unknown()` at
 * the parse boundary, so a kagent version putting a bare string there — an
 * `auth-required` hint, say — would otherwise reach `parseHistoryEntry`, fail
 * `a2aMessageWireSchema` and count as `skippedMessages`, which the UI reports as
 * "1 message could not be read" on a session that is in fact perfectly healthy.
 * A shape we cannot render should be invisible, not announced as data loss.
 */
function historyWithPendingPrompt(task: A2aTaskWire): unknown[] {
  const history = Array.isArray(task.history) ? task.history : [];
  const state = task.status?.state?.toLowerCase();
  const pending = task.status?.message;
  if (
    !pending ||
    typeof pending !== 'object' ||
    !state ||
    !AWAITING_INPUT_STATES.has(state)
  ) {
    return history;
  }
  return [...history, pending];
}

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
 * **On timestamps:** every item takes its *task's* timestamp, because A2A
 * messages carry none of their own and there is no finer-grained source. The
 * session's stored events looked like one, but a real gazelle payload showed each
 * event's `data` to be a serialized ADK event with no `messageId` — nothing to
 * join on — and its `invocation_id` only distinguishes turns, which the task
 * already does. So items within a turn deliberately share a time, and the UI
 * should present it per turn rather than implying per-message precision.
 *
 * @param tasks - kagent's tasks, already in chronological order (it returns them
 *   `ORDER BY created_at ASC`).
 */
export function buildTimeline(tasks: A2aTaskWire[]): SessionTimeline {
  const items: TimelineItem[] = [];
  let tokens = EMPTY_USAGE;
  let skippedMessages = 0;

  // kagent repeats a message under the same `messageId` — reliably for the user's
  // message on every turn, and in principle across tasks in an overlapping history
  // window. Rendering it twice reads as it having been said twice.
  const seenMessageIds = new Set<string>();
  // Calls a deduped message already produced, so a response arriving in a *later*
  // task can still fold into the existing item instead of orphaning. Without this,
  // a repeated call message whose response lands in the next task renders twice:
  // once stuck pending, once as a result with no request.
  const callsByMessageId = new Map<string, OpenCall[]>();
  // The approval awaiting a verdict, at session scope. Per task would be wrong:
  // kagent can record the user's decision in a *new* task, and a per-task variable
  // would drop that decision and leave the approval looking unanswered forever.
  // Only one can be open at a time — kagent suspends until the user answers.
  let openApprovalIndex: number | undefined;

  tasks.forEach((task, taskIndex) => {
    // Through `normalizeTimestamp` like every other kagent timestamp: these are
    // non-pointer Go `time.Time`, so an unset one arrives as `0001-01-01T00:00:00Z`
    // and renders as "Dec 31, 0000". It matters more here than anywhere else,
    // because this is now the *only* timestamp source — it becomes `at` for every
    // item in the task.
    const taskTimestamp = normalizeTimestamp(task.status?.timestamp);
    const entries = historyWithPendingPrompt(task);

    // Open calls are per task: a response never answers a call from another turn,
    // and letting them match across tasks would attach a result to the wrong call
    // when a tool is used repeatedly.
    const openCalls: OpenCall[] = [];

    entries.forEach((entry, entryIndex) => {
      const parsed = parseHistoryEntry(entry);
      if (parsed.kind === 'unparseable') {
        skippedMessages += 1;
        return;
      }
      if (parsed.kind === 'other') {
        // A well-formed entry we have no renderer for — an artifact or status
        // update. Not data loss, so it must not inflate `skippedMessages`.
        return;
      }
      const message = parsed.message;

      if (message.messageId) {
        if (seenMessageIds.has(message.messageId)) {
          // Re-arm this message's calls in the current task so a response here can
          // still resolve the item the first copy created.
          const previous = callsByMessageId.get(message.messageId);
          if (previous) {
            openCalls.push(...previous);
          }
          return;
        }
        seenMessageIds.add(message.messageId);
      }

      const at = taskTimestamp;
      const author = readKagentMetadataString(message.metadata, 'author');
      const isUser = message.role === 'user';

      // Usage is only counted for agent messages: kagent attributes a turn's
      // tokens to the agent's reply, and a user message carrying a usage bag
      // (some do) would double count the same turn.
      if (!isUser) {
        tokens = addTokenUsage(tokens, readTokenUsage(message.metadata));
      }

      const parts = Array.isArray(message.parts) ? message.parts : [];

      // A verdict arrives as a data part on a *user* message. The verdict itself is
      // shown on the approval card rather than as a message of its own — but the
      // message may also carry the user's actual words, and those are conversation.
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

          // Deliberately **not** returning here. An `ask_user` reply arrives as a
          // text part on this same message, and bailing out discarded it — the
          // question and the agent's follow-up were shown, but what the user
          // actually said vanished from the conversation.
          //
          // The text parts fall through to the normal handling below. When there
          // are none, the answers are recovered from the decision payload's
          // `ask_user_answers` instead: kagent's own UI reads only that field, so it
          // may be the sole carrier on sessions that did not come through a
          // gateway that also writes the text part.
          if (decision.answers.length > 0 && !hasTextPart(parts)) {
            items.push({
              kind: 'user-message',
              id: `${taskIndex}:${entryIndex}:${items.length}`,
              at,
              taskIndex,
              text: decision.answers.join('\n\n'),
            });
            return;
          }
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
          //
          // Except for ADK's own plumbing. An approval is rendered as its own item
          // and never registered as an open call, so the `function_response` ADK
          // sends when it resumes the long-running confirmation always lands here —
          // and without this it would render as a tool call literally named
          // `adk_request_confirmation`, carrying the internal confirmation payload
          // as its result, immediately after the approval card. kagent's own UI
          // filters this name out of tool calls for the same reason
          // (`ui/src/lib/toolCallExtraction.ts`).
          if (
            isInternalToolName(response.name) ||
            response.name === CONFIRMATION_TOOL_NAME
          ) {
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

        // An approval request is a call to ADK's confirmation tool, wrapping the
        // call the agent actually proposed.
        //
        // Discriminated on the **name alone**. kagent marks these long-running and
        // its own UI checks that flag, but relying on it here would be fragile in a
        // way that fails loudly: a missing flag — or one arriving as the string
        // `"true"`, which `isKagentMetadataFlagSet` rejects by design — would make
        // this render as a raw tool call named `adk_request_confirmation` with the
        // internal `originalFunctionCall` wrapper as its arguments. The name is
        // sufficient and can't degrade like that.
        if (call.name === CONFIRMATION_TOOL_NAME) {
          const proposed = readProposedCall(call.args);
          const isQuestion = proposed?.name === ASK_USER_TOOL_NAME;
          openApprovalIndex = items.length;
          items.push({
            kind: 'approval',
            id: `${taskIndex}:${entryIndex}:${items.length}`,
            at,
            author,
            taskIndex,
            asks: isQuestion ? 'input' : 'approval',
            toolName: proposed?.name,
            questions: isQuestion
              ? readAskUserQuestions(proposed?.args)
              : undefined,
            args: proposed?.args,
          });
          return;
        }

        if (isInternalToolName(call.name)) {
          return;
        }

        // Agents reach most MCP tools through muster's `call_tool`, so without
        // looking through that wrapper every row would read `call_tool` and the
        // real tool would be buried in the arguments.
        const effective = unwrapProxiedCall(call);

        const itemIndex = items.length;
        items.push(
          makeCallItem({
            id: `${taskIndex}:${entryIndex}:${itemIndex}`,
            at,
            author,
            taskIndex,
            name: effective.name,
            args: effective.args,
            result: undefined,
            isPending: true,
            via: effective.via,
          }),
        );
        if (call.id) {
          const open = { callId: call.id, itemIndex };
          openCalls.push(open);
          // Remembered so a repeat of this message in a later task can re-arm the
          // call rather than letting its response orphan into a second item.
          if (message.messageId) {
            const existing = callsByMessageId.get(message.messageId);
            if (existing) {
              existing.push(open);
            } else {
              callsByMessageId.set(message.messageId, [open]);
            }
          }
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
  /** Set when the name and args came out of a proxy wrapper. */
  via?: string;
}): TimelineItem {
  const { name, via, ...rest } = input;
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
    ...(via ? { via } : {}),
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
 * The questions an `ask_user` call is putting to the user.
 *
 * Shape on the wire, from a live gazelle session:
 * `args: { questions: [{ question: "…" }] }` — one entry per question, and a real
 * `ask_user` can ask several at once.
 *
 * Anything that doesn't match is skipped rather than coerced: a question rendered
 * from a guessed field would put words in the agent's mouth, and the raw args are
 * still shown when nothing here matches.
 */
function readAskUserQuestions(args: unknown): string[] {
  if (!args || typeof args !== 'object') {
    return [];
  }
  const { questions } = args as { questions?: unknown };
  if (!Array.isArray(questions)) {
    return [];
  }
  return questions
    .map(entry => {
      if (typeof entry === 'string') {
        return entry;
      }
      if (entry && typeof entry === 'object') {
        const { question } = entry as { question?: unknown };
        return typeof question === 'string' ? question : undefined;
      }
      return undefined;
    })
    .filter((text): text is string => Boolean(text && text.trim()));
}

/**
 * Whether this message is the user's answer to a pending approval, and which way.
 *
 * kagent marks a decision with `data.decision_type` on a data part of a *user*
 * message. It is either a uniform verdict applying to every pending call, or
 * `'batch'` with a per-call map.
 *
 * Returning an object means "this message is a decision", so its verdict belongs
 * on the approval card rather than as a message of its own. A `verdict` of
 * `undefined` inside that object means the wording was one we don't recognise: the
 * approval is resolved, but we decline to say how. Defaulting to `'approved'` there
 * would put words in the user's mouth about an action they may have refused.
 *
 * `answers` carries what the user actually typed in reply to an `ask_user`
 * question, from the payload's `ask_user_answers`. It is a fallback: the same words
 * usually arrive as a plain text part on this message, which reads better and is
 * preferred. kagent's own UI reads only this structured field, so a session may
 * exist where it is the sole carrier.
 */
function readDecision(
  parts: unknown[],
): { verdict?: 'approved' | 'rejected'; answers: string[] } | undefined {
  for (const rawPart of parts) {
    const part = parsePart(rawPart);
    if (!part || !part.data || typeof part.data !== 'object') {
      continue;
    }
    const data = part.data as {
      decision_type?: unknown;
      decisions?: unknown;
      ask_user_answers?: unknown;
    };
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
        return { answers: readAskUserAnswers(data) };
      }
      return {
        verdict: verdicts.includes('rejected') ? 'rejected' : 'approved',
        answers: readAskUserAnswers(data),
      };
    }

    return {
      verdict: readVerdictWord(decisionType),
      answers: readAskUserAnswers(data),
    };
  }
  return undefined;
}

/**
 * Whether any part of a message carries text that will actually render.
 *
 * Decides whether a decision message already contains the user's own words, in
 * which case they render from the text part and `ask_user_answers` is not needed.
 *
 * **Blank text does not count.** `flushText` drops a run that trims to nothing, so
 * treating a `{ text: '' }` part as words would lose the reply twice over: the
 * `ask_user_answers` fallback skipped because "there is text", and the text itself
 * dropped for being empty — the exact "the user's answer vanished" symptom this
 * fallback exists to prevent. The predicate has to agree with what `flushText`
 * will keep.
 */
function hasTextPart(parts: unknown[]): boolean {
  return parts.some(rawPart => Boolean(parsePart(rawPart)?.text?.trim()));
}

/**
 * The user's answers to an `ask_user` question, out of a decision payload.
 *
 * One entry per question asked, each with an `answer` array — questions the user
 * skipped have an empty one, so those are dropped rather than rendered as blanks.
 */
function readAskUserAnswers(data: { ask_user_answers?: unknown }): string[] {
  const entries = data.ask_user_answers;
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .flatMap(entry => {
      const answer = (entry as { answer?: unknown })?.answer;
      if (typeof answer === 'string') {
        return [answer];
      }
      return Array.isArray(answer) ? answer : [];
    })
    .filter(
      (value): value is string => typeof value === 'string' && value !== '',
    );
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
