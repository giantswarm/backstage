import {
  a2aMessageWireSchema,
  A2aMessageWire,
  a2aStreamEventWireSchema,
} from './kagentTaskSchema';
import { readKagentMetadata, readKagentMetadataString } from './kagentMetadata';
import {
  CONFIRMATION_TOOL_NAME,
  isAgentToolName,
  isFunctionCallPart,
  isFunctionResponsePart,
  isInternalToolName,
  isThoughtPart,
  parsePart,
  readFunctionCall,
  readFunctionResponse,
  readPartText,
  unwrapProxiedCall,
} from './kagentParts';
import { TimelineItem } from './kagentTimeline';

/**
 * Interpreting one A2A `message/stream` turn, live.
 *
 * The stream is a **preview of the turn in flight**, never a second source of
 * truth: everything it shows is written to the task's history as the turn
 * progresses, and the conversation poll delivers that history. So the reducer
 * here aims for "show what is happening now" — the canonical record arrives
 * through `buildTimeline` regardless, and the whole overlay is discarded once
 * the turn has been reconciled (see `useSendMessage`). A stream event we cannot
 * read costs us that event's liveness and nothing else.
 *
 * The event semantics mirror kagent's own UI (`ui/src/lib/messageHandlers.ts`),
 * which is the only consumer of this wire that upstream keeps working. Both of
 * kagent's executors are covered, and they stream *differently*:
 *
 * - the **Python** executor sends response text as chunks on non-final
 *   `status-update` events, with the terminal (`final: true`) event carrying the
 *   complete message;
 * - the **Go** executor sends response text as `artifact-update` events stamped
 *   `{adk,kagent}_partial: true` for chunks and `false` for the complete
 *   message, with `lastChunk` on a final (possibly empty) sentinel.
 *
 * Tool activity arrives the same way in both: `function_call` /
 * `function_response` data parts on `status-update` messages, complete from the
 * start — those become ordinary `tool-call` / `agent-call` items immediately.
 */

/** The state of one streamed turn, as of the last event applied. */
export type StreamTurn = {
  /** The `messageId` of the user message that opened this turn. */
  sentMessageId: string;
  /**
   * kagent produced at least one readable event, i.e. the message was
   * dispatched. What lets a stream failure be classified without a
   * verification read: after any event, the turn exists and the poll will
   * finish the job.
   */
  dispatched: boolean;
  /** The task the turn runs as, once an event named it. */
  taskId?: string;
  /**
   * Completed items of the in-flight turn, in the order they happened.
   *
   * `TimelineItem`s so the timeline renders them exactly like their polled
   * equivalents — but their `taskIndex` is a placeholder `0`: only the page
   * knows which turn index the poll will assign, and it re-stamps them when
   * merging (as it already does for the optimistic user message).
   */
  items: TimelineItem[];
  /** Response text still being produced — no complete message carries it yet. */
  liveText: string;
  /** Reasoning still being produced. */
  liveReasoning: string;
  /** A terminal `status-update` was seen: the turn is over. */
  isFinal: boolean;
  /** Newest A2A state the stream reported, lowercased. */
  stateKey?: string;
  /** Calls awaiting their response, by function-call id. Internal. */
  openCalls: { callId: string; itemIndex: number }[];
  /** Monotonic id source for {@link items}. Internal. */
  nextItemId: number;
};

export function createStreamTurn(sentMessageId: string): StreamTurn {
  return {
    sentMessageId,
    dispatched: false,
    items: [],
    liveText: '',
    liveReasoning: '',
    isFinal: false,
    openCalls: [],
    nextItemId: 0,
  };
}

/**
 * Fold one stream event into the turn. Pure: returns a new state, never throws
 * — an unreadable event returns the previous state with only `dispatched` set,
 * because even an event we cannot parse proves kagent is running the turn.
 */
export function applyStreamEvent(turn: StreamTurn, data: unknown): StreamTurn {
  const parsed = a2aStreamEventWireSchema.safeParse(data);
  if (!parsed.success) {
    return turn.dispatched ? turn : { ...turn, dispatched: true };
  }
  const event = parsed.data;
  const next: StreamTurn = {
    ...turn,
    dispatched: true,
    items: turn.items,
    openCalls: turn.openCalls,
  };

  switch (event.kind) {
    case 'task': {
      next.taskId = event.id ?? next.taskId;
      const state = event.status?.state?.toLowerCase();
      if (state) {
        next.stateKey = state;
      }
      // The snapshot's `history` is deliberately not ingested: for a resumed
      // task it repeats messages the timeline already shows, and the poll owns
      // the history either way.
      return next;
    }

    case 'status-update': {
      const state = event.status?.state?.toLowerCase();
      if (state) {
        next.stateKey = state;
      }
      const isFinal = event.final === true;
      if (isFinal) {
        next.isFinal = true;
      }

      const message = readAgentMessage(event.status?.message);
      if (message) {
        if (isFinal) {
          // The terminal event carries the complete message; whatever the
          // buffers hold is that message's earlier chunks.
          ingestCompleteMessage(next, message);
          next.liveText = '';
          next.liveReasoning = '';
        } else {
          ingestIncrementalMessage(next, message);
        }
      } else if (isFinal) {
        // A terminal event with no readable message still ends the live view —
        // leaving the buffers up would show "still typing" over a finished turn.
        flushLiveBuffers(next);
      }
      return next;
    }

    case 'artifact-update': {
      const parts = Array.isArray(event.artifact?.parts)
        ? event.artifact.parts
        : [];
      // The partial stamp lives on the event's own metadata bag, with the
      // artifact's as fallback — kagent's UI reads it in the same order.
      const partial =
        readKagentMetadata(event.metadata, 'partial') ??
        readKagentMetadata(event.artifact?.metadata, 'partial');

      let text = '';
      for (const rawPart of parts) {
        const part = parsePart(rawPart);
        if (!part) {
          continue;
        }
        const partText = readPartText(part);
        if (partText !== undefined) {
          text += partText;
          continue;
        }
        // Tool activity can travel on artifacts too; it is complete whenever it
        // appears, whatever the partial stamp says about the text.
        ingestDataPart(next, part, undefined);
      }

      if (partial === true) {
        if (text) {
          next.liveText = next.liveText + text;
        }
        return next;
      }

      if (partial === false || event.lastChunk === true) {
        // The complete response message (Go executor), or the closing sentinel
        // (whose text, when present, is the complete message — Python flow).
        if (text) {
          pushTextItem(next, 'agent-message', text, undefined, undefined);
        }
        next.liveText = '';
        return next;
      }

      return next;
    }

    case 'message': {
      const message = readAgentMessage(event);
      if (message) {
        ingestCompleteMessage(next, message);
      }
      return next;
    }

    default:
      return next;
  }
}

/**
 * Parse something claiming to be a message, keeping only an *agent's*. The
 * user's own words are already on screen — optimistically, and echoed back by
 * kagent under the same `messageId` — so re-adding them here would double them.
 */
function readAgentMessage(value: unknown): A2aMessageWire | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const parsed = a2aMessageWireSchema.safeParse(value);
  if (!parsed.success || parsed.data.role === 'user') {
    return undefined;
  }
  return parsed.data;
}

/**
 * A complete message: text parts merge into runs exactly as `buildTimeline`
 * merges them, data parts become call items.
 */
function ingestCompleteMessage(turn: StreamTurn, message: A2aMessageWire) {
  if (
    message.messageId &&
    turn.items.some(item => item.messageId === message.messageId)
  ) {
    return;
  }
  const author = readKagentMetadataString(message.metadata, 'author');
  const parts = Array.isArray(message.parts) ? message.parts : [];

  let textRun: { isThought: boolean; chunks: string[] } | undefined;
  const flushRun = () => {
    if (!textRun) {
      return;
    }
    const text = textRun.chunks.join('').trim();
    const wasThought = textRun.isThought;
    textRun = undefined;
    if (!text) {
      return;
    }
    pushTextItem(
      turn,
      wasThought ? 'reasoning' : 'agent-message',
      text,
      message.messageId,
      author,
    );
  };

  for (const rawPart of parts) {
    const part = parsePart(rawPart);
    if (!part) {
      continue;
    }
    const text = readPartText(part);
    if (text !== undefined) {
      const isThought = isThoughtPart(part);
      if (textRun && textRun.isThought !== isThought) {
        flushRun();
      }
      textRun ??= { isThought, chunks: [] };
      textRun.chunks.push(text);
      continue;
    }
    flushRun();
    ingestDataPart(turn, part, author);
  }
  flushRun();
}

/**
 * A non-final `status-update` message: its text parts are **chunks** of a
 * message still being produced, so they accumulate in the live buffers, while
 * its data parts are complete from the start.
 */
function ingestIncrementalMessage(turn: StreamTurn, message: A2aMessageWire) {
  const author = readKagentMetadataString(message.metadata, 'author');
  const parts = Array.isArray(message.parts) ? message.parts : [];
  for (const rawPart of parts) {
    const part = parsePart(rawPart);
    if (!part) {
      continue;
    }
    const text = readPartText(part);
    if (text !== undefined) {
      if (isThoughtPart(part)) {
        turn.liveReasoning = turn.liveReasoning + text;
      } else {
        turn.liveText = turn.liveText + text;
      }
      continue;
    }
    ingestDataPart(turn, part, author);
  }
}

/**
 * One `function_call` / `function_response` data part.
 *
 * The same skips as `buildTimeline`, for the same reasons: ADK's plumbing is
 * not activity, and a confirmation request is deliberately **not** previewed —
 * the reply arrives with the `input-required` state, at which point the polled
 * task's `status.message` drives the real answer panel, which is the one that
 * can actually resume the task.
 */
function ingestDataPart(
  turn: StreamTurn,
  part: NonNullable<ReturnType<typeof parsePart>>,
  author: string | undefined,
) {
  if (isFunctionResponsePart(part)) {
    const response = readFunctionResponse(part);
    const openIndex = response.id
      ? turn.openCalls.findIndex(open => open.callId === response.id)
      : -1;
    if (openIndex >= 0) {
      const openCalls = [...turn.openCalls];
      const [open] = openCalls.splice(openIndex, 1);
      const items = [...turn.items];
      const item = items[open.itemIndex];
      if (item && (item.kind === 'tool-call' || item.kind === 'agent-call')) {
        items[open.itemIndex] = {
          ...item,
          result: response.response,
          isPending: false,
        };
      }
      turn.items = items;
      turn.openCalls = openCalls;
      return;
    }
    // HITL plumbing resolves through the answer panel, not as a tool row.
    if (
      isInternalToolName(response.name) ||
      response.name === CONFIRMATION_TOOL_NAME
    ) {
      return;
    }
    // An orphan response — its call was before this stream opened. Rendered,
    // matching `buildTimeline`: a result with no visible request is odd, but
    // hiding it is worse.
    pushCallItem(turn, {
      name: response.name,
      args: undefined,
      result: response.response,
      isPending: false,
      author,
    });
    return;
  }

  if (!isFunctionCallPart(part)) {
    return;
  }
  const call = readFunctionCall(part);
  if (call.name === CONFIRMATION_TOOL_NAME || isInternalToolName(call.name)) {
    return;
  }
  const effective = unwrapProxiedCall(call);
  const itemIndex = turn.items.length;
  pushCallItem(turn, {
    name: effective.name,
    via: effective.via,
    args: effective.args,
    result: undefined,
    isPending: true,
    author,
  });
  if (call.id) {
    turn.openCalls = [...turn.openCalls, { callId: call.id, itemIndex }];
  }
}

/** Move whatever the live buffers hold into completed items. */
function flushLiveBuffers(turn: StreamTurn) {
  if (turn.liveReasoning.trim()) {
    pushTextItem(
      turn,
      'reasoning',
      turn.liveReasoning.trim(),
      undefined,
      undefined,
    );
  }
  if (turn.liveText.trim()) {
    pushTextItem(
      turn,
      'agent-message',
      turn.liveText.trim(),
      undefined,
      undefined,
    );
  }
  turn.liveText = '';
  turn.liveReasoning = '';
}

function pushTextItem(
  turn: StreamTurn,
  kind: 'agent-message' | 'reasoning',
  text: string,
  messageId: string | undefined,
  author: string | undefined,
) {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  // The Go flow can deliver the same response twice — as the `partial: false`
  // artifact and again on the terminal status update — and only one of the two
  // carries a `messageId` to dedupe on. Identical adjacent text is the tell.
  const last = turn.items.at(-1);
  if (last && last.kind === kind && last.text === trimmed) {
    return;
  }
  turn.items = [
    ...turn.items,
    {
      kind,
      id: `stream:${turn.nextItemId}`,
      taskIndex: 0,
      messageId,
      author,
      text: trimmed,
    },
  ];
  turn.nextItemId += 1;
}

function pushCallItem(
  turn: StreamTurn,
  input: {
    name: string | undefined;
    via?: string;
    args: unknown;
    result: unknown;
    isPending: boolean;
    author: string | undefined;
  },
) {
  const base = {
    id: `stream:${turn.nextItemId}`,
    taskIndex: 0,
    author: input.author,
    args: input.args,
    result: input.result,
    isPending: input.isPending,
  };
  const item: TimelineItem = isAgentToolName(input.name)
    ? { ...base, kind: 'agent-call', agentId: input.name as string }
    : {
        ...base,
        kind: 'tool-call',
        toolName: input.name ?? 'unknown tool',
        ...(input.via ? { via: input.via } : {}),
      };
  turn.items = [...turn.items, item];
  turn.nextItemId += 1;
}

/**
 * Incremental decoder for the SSE stream the backend relays: feed it raw text
 * chunks, get back the `data:` payloads of every event completed so far.
 *
 * Only as much SSE as a2a-go's writer produces (`id:` and `data:` lines, `:`
 * keep-alive comments, blank-line delimiters), but tolerant of the parts of the
 * spec another writer might use: CRLF line endings, multiple `data:` lines per
 * event (joined with newlines), and a missing space after the colon.
 */
export function createSseDataDecoder(): {
  /** Feed one chunk; returns the data payloads of events completed by it. */
  push(chunk: string): string[];
  /** Signal end-of-stream; returns the payload of an unterminated last event. */
  end(): string[];
} {
  let buffer = '';
  let dataLines: string[] = [];

  const takeEvent = (): string | undefined => {
    if (dataLines.length === 0) {
      return undefined;
    }
    const data = dataLines.join('\n');
    dataLines = [];
    return data;
  };

  const consumeLine = (rawLine: string): string | undefined => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '') {
      return takeEvent();
    }
    if (line.startsWith('data:')) {
      const value = line.slice('data:'.length);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
    // `id:`, `event:`, retry fields and comments carry nothing this consumer
    // uses.
    return undefined;
  };

  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const events: string[] = [];
      for (;;) {
        const newline = buffer.indexOf('\n');
        if (newline < 0) {
          break;
        }
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const event = consumeLine(line);
        if (event !== undefined) {
          events.push(event);
        }
      }
      return events;
    },
    end(): string[] {
      // A stream cut mid-event can leave a final data line with no terminating
      // blank line. It is a complete JSON payload or it is nothing — the frame
      // reader decides, so hand it over rather than dropping it.
      if (buffer !== '') {
        consumeLine(buffer);
        buffer = '';
      }
      const event = takeEvent();
      return event === undefined ? [] : [event];
    },
  };
}

/** What one SSE `data:` frame of the relayed stream turned out to hold. */
export type StreamFrame =
  | { kind: 'event'; result: unknown }
  | { kind: 'error'; message: string }
  | { kind: 'unreadable' };

/**
 * Read one frame's JSON-RPC envelope.
 *
 * A2A reports failures **in-band**: a frame carrying `error` instead of
 * `result` is how a2a-go says the turn could not run (unresolvable agent,
 * invalid params, an executor that panicked). Distinguished here so the caller
 * can treat it as a decision rather than a broken pipe.
 */
export function readStreamFrame(data: string): StreamFrame {
  let envelope: unknown;
  try {
    envelope = JSON.parse(data);
  } catch {
    return { kind: 'unreadable' };
  }
  if (!envelope || typeof envelope !== 'object') {
    return { kind: 'unreadable' };
  }
  const error = (envelope as { error?: unknown }).error;
  if (error) {
    const message = (error as { message?: unknown })?.message;
    return {
      kind: 'error',
      message:
        typeof message === 'string' && message
          ? message
          : 'the agent rejected the message without saying why',
    };
  }
  return { kind: 'event', result: (envelope as { result?: unknown }).result };
}
