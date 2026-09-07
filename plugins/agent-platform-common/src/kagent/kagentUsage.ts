import { A2aTaskWire } from './kagentTaskSchema';
import { normalizeTimestamp } from './kagentSessions';
import {
  addTokenUsage,
  CONFIRMATION_TOOL_NAME,
  isAgentToolName,
  isFunctionCallPart,
  isFunctionResponsePart,
  isInternalToolName,
  parseHistoryEntry,
  parsePart,
  readFunctionCall,
  readFunctionResponse,
  readNestedTokenUsage,
  readTokenUsage,
  TokenUsage,
  unwrapProxiedCall,
} from './kagentParts';

/** Running counters for a session, a day, or an agent. */
export type UsageTally = {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  /**
   * kagent's reported total, which can exceed input + output.
   *
   * A model billing thinking tokens separately counts them in the total and in
   * neither part, so summing the two parts would under-report it with no way to
   * notice. Carried so that difference stays visible.
   */
  totalTokens: number;
  toolCalls: number;
};

export type SessionUsage = {
  tally: UsageTally;
  /** UTC day (`YYYY-MM-DD`) to that day's tally. */
  days: Map<string, UsageTally>;
  /** Unwrapped tool name to call count. */
  tools: Map<string, number>;
  /** muster server segment, or `null` for a tool not proxied, to call count. */
  servers: Map<string | null, number>;
  /**
   * Turns counted in `tally` that carried no usable timestamp, so are in no
   * day bucket. Non-zero means the daily view legitimately under-sums the
   * totals.
   */
  undatedTurns: number;
  /** History entries that failed to parse. For logging, never for display. */
  unparseableMessages: number;
};

export function emptyTally(): UsageTally {
  return {
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    toolCalls: 0,
  };
}

/** `YYYY-MM-DD` in UTC. */
export function utcDayKey(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

const MUSTER_TOOL_PREFIX = 'x_';

/**
 * The muster server a tool name implies, or `null` when it is not proxied.
 *
 * muster names an aggregated tool `x_{family|toolPrefix|name}_{tool}`
 * (`MCPServer.getToolNamePrefix`), so the first `_`-delimited segment after
 * `x_` is the server. That is exact for every server observed — `prometheus`,
 * `kubernetes`, `github` — and collapses a prefix that itself contains `_`
 * (`x_kubernetes_gazelle_*` reads as `kubernetes`), which is the family level
 * and the useful grouping anyway.
 *
 * Deliberately not shared with muster's own `segmentOf`: that lives in an
 * unrelated plugin, is private to it, and its exact path needs the
 * installation's `MCPServer` CRs, which nothing on this side can read. The MCP
 * section of the Usage page resolves servers exactly, from Prometheus's
 * `mcpserver_name` label, which is why an approximation is acceptable here.
 */
export function mcpServerOf(tool: string | undefined): string | null {
  if (!tool || !tool.startsWith(MUSTER_TOOL_PREFIX)) {
    return null;
  }
  const segment = tool.slice(MUSTER_TOOL_PREFIX.length).split('_')[0];
  return segment || null;
}

function bump<K>(counts: Map<K, number>, key: K): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function addUsage(tally: UsageTally, usage: TokenUsage | undefined): void {
  if (!usage) {
    return;
  }
  const summed = addTokenUsage(
    {
      total: tally.totalTokens,
      prompt: tally.inputTokens,
      completion: tally.outputTokens,
    },
    usage,
  );
  tally.totalTokens = summed.total;
  tally.inputTokens = summed.prompt;
  tally.outputTokens = summed.completion;
}

/**
 * One session's usage inside a window. Never throws.
 *
 * A leaner sibling of the frontend's `buildTimeline`, which allocates a render
 * item per message and returns only a session total. The two must agree on the
 * arithmetic, so every non-obvious rule here is the one that function already
 * follows, and `kagentUsage.test.ts` cross-checks the sums against it on a
 * shared fixture.
 *
 * The rules that are not obvious, and why:
 *
 * - **A turn is a task.** kagent records one `status.timestamp` per task and no
 *   per-message timestamps, so a task is the finest unit that has a time.
 * - **The window is applied per task, not per session.** A session last used
 *   yesterday can hold turns from months ago, so filtering only the session list
 *   would sweep them all in.
 * - **A task with no usable timestamp still counts** toward the totals, and is
 *   reported in `undatedTurns`. Dropping it would silently zero a kagent that
 *   stopped writing the field; dating it would claim a date we do not have.
 * - **`messageId` dedupe is at session scope and is required, not defensive.**
 *   kagent repeats the user's message verbatim every turn, and can repeat an
 *   agent message across an overlapping history window — which would double
 *   count its usage bag.
 * - **Usage is counted on agent messages only.** kagent attributes a turn's
 *   tokens to the agent's reply, and some user messages carry a usage bag of
 *   their own, so counting those would double count the turn.
 * - **A delegated agent's usage rides in the tool *response*** and is counted.
 *   That is not double counting: a subagent runs in its own session, whose
 *   messages are not in these tasks and which `isListableSession` excludes from
 *   the pass anyway, so the response is the only place its cost appears.
 * - **A delegation is not a tool call.** It is registered so its response can be
 *   recognised, and counted in neither `toolCalls` nor `tools`.
 */
export function reduceSessionUsage(
  tasks: A2aTaskWire[],
  window: { startMs: number; endMs: number },
): SessionUsage {
  const tally = emptyTally();
  const days = new Map<string, UsageTally>();
  const tools = new Map<string, number>();
  const servers = new Map<string | null, number>();
  let undatedTurns = 0;
  let unparseableMessages = 0;

  const seenMessageIds = new Set<string>();
  // Session-scoped, not per task: a deduped repeat message is skipped whole, so
  // its call ids have to still be known when the response lands in a later
  // task. Keyed on the *call* rather than only the response name because a
  // response does not always repeat the name.
  const agentCallIds = new Set<string>();

  for (const task of tasks) {
    const at = normalizeTimestamp(task.status?.timestamp);
    const atMs = at === undefined ? undefined : Date.parse(at);
    if (atMs !== undefined && (atMs < window.startMs || atMs > window.endMs)) {
      continue;
    }

    const turn = emptyTally();
    turn.turns = 1;

    for (const entry of task.history ?? []) {
      const parsed = parseHistoryEntry(entry);
      if (parsed.kind === 'unparseable') {
        unparseableMessages += 1;
        continue;
      }
      if (parsed.kind !== 'message') {
        continue;
      }
      const message = parsed.message;

      if (message.messageId) {
        if (seenMessageIds.has(message.messageId)) {
          continue;
        }
        seenMessageIds.add(message.messageId);
      }

      if (message.role !== 'user') {
        addUsage(turn, readTokenUsage(message.metadata));
      }

      for (const rawPart of message.parts ?? []) {
        const part = parsePart(rawPart);
        if (!part) {
          continue;
        }

        if (isFunctionResponsePart(part)) {
          const response = readFunctionResponse(part);
          const isDelegation =
            (response.id !== undefined && agentCallIds.has(response.id)) ||
            isAgentToolName(response.name);
          if (isDelegation) {
            addUsage(turn, readNestedTokenUsage(response.response));
          }
          continue;
        }

        if (!isFunctionCallPart(part)) {
          continue;
        }

        const call = readFunctionCall(part);
        if (
          call.name === CONFIRMATION_TOOL_NAME ||
          isInternalToolName(call.name)
        ) {
          continue;
        }
        if (isAgentToolName(call.name)) {
          if (call.id) {
            agentCallIds.add(call.id);
          }
          continue;
        }

        const effective = unwrapProxiedCall(call);
        const name = effective.name ?? 'unknown tool';
        turn.toolCalls += 1;
        bump(tools, name);
        bump(servers, mcpServerOf(name));
      }
    }

    tally.turns += turn.turns;
    tally.toolCalls += turn.toolCalls;
    addUsage(tally, {
      total: turn.totalTokens,
      prompt: turn.inputTokens,
      completion: turn.outputTokens,
    });

    if (atMs === undefined) {
      undatedTurns += 1;
      continue;
    }

    const key = utcDayKey(atMs);
    const day = days.get(key) ?? emptyTally();
    day.turns += turn.turns;
    day.toolCalls += turn.toolCalls;
    addUsage(day, {
      total: turn.totalTokens,
      prompt: turn.inputTokens,
      completion: turn.outputTokens,
    });
    days.set(key, day);
  }

  return { tally, days, tools, servers, undatedTurns, unparseableMessages };
}
