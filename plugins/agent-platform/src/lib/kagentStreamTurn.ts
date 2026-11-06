import {
  A2aMessageWire,
  a2aMessageWireSchema,
  A2aStreamEventWire,
  a2aStreamEventWireSchema,
  CANCELED_STATE,
  CONFIRMATION_TOOL_NAME,
  describeSessionState,
  normalizeStreamEvent,
  FAILED_STATES,
  isAgentToolName,
  isFunctionCallPart,
  isFunctionResponsePart,
  isInternalToolName,
  isRecord,
  parsePart,
  readFunctionCall,
  readFunctionResponse,
  readKagentMetadata,
  readKagentMetadataString,
  readMessageText,
  readAttachment,
  splitMessageParts,
  unwrapProxiedCall,
} from '@giantswarm/backstage-plugin-agent-platform-common';

import { TimelineItem } from './kagentTimeline';
import { readWorkspaceNotice } from './workspaceNotice';

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
 * - the **Python** executor sends response text on non-final `status-update`
 *   events — one event per message it completes, each with its own `messageId`,
 *   and a message's tool calls travel in that same event *after* its text parts
 *   — with the terminal (`final: true`) event carrying the complete message;
 * - the **Go** executor sends response text as `artifact-update` events stamped
 *   `{adk,kagent}_partial: true` for chunks and `false` for the complete
 *   message, with `lastChunk` on a final (possibly empty) sentinel.
 *
 * Tool activity arrives the same way in both: `function_call` /
 * `function_response` data parts on `status-update` messages, complete from the
 * start — those become ordinary `tool-call` / `agent-call` items immediately.
 */

/** Text still being produced, and the message whose parts it came from. */
export type LiveRun = {
  kind: 'agent-message' | 'reasoning';
  /** Chunks as received; rendered trimmed, so no chunk boundary is lost. */
  text: string;
  /**
   * The message these chunks belong to, when the event named one.
   *
   * Two jobs: it tells the terminal event "these are that same message's chunks,
   * which its complete copy supersedes" from "these are an *earlier* message's,
   * which must keep their place"; and it is carried onto the finished item, so
   * the poll's copy of that message is recognised and the preview dropped.
   */
  messageId?: string;
  author?: string;
};

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
  /**
   * The text run still being produced — no complete message carries it yet.
   *
   * At most one is ever open, and it is always **newer than every entry in**
   * {@link items}: anything else that arrives closes it first. That invariant is
   * what makes "items, then the open run" the chronological order, so the page
   * can render it by appending and nothing has to be sorted.
   */
  live?: LiveRun;
  /** A terminal `status-update` was seen: the turn is over. */
  isFinal: boolean;
  /**
   * Some event of this turn carried a file part.
   *
   * The live preview renders text and calls only, so a file is left to the
   * polled conversation, and this is how the caller knows to re-read it now
   * rather than on the next poll. Flips once per turn: the terminal event
   * repeats the parts a turn already streamed.
   */
  carriesFile: boolean;
  /** Newest A2A state the stream reported, lowercased. */
  stateKey?: string;
  /**
   * Events folded so far — a change counter for anyone following the turn.
   *
   * Strictly increasing, which nothing derived from the content is: closing a
   * run moves text out of {@link live} and into {@link items} one item at a
   * time, so a size derived from both can hold steady across a real update and
   * hide it from an effect watching for one.
   */
  revision: number;
  /**
   * Partial artifact chunks are being skipped: the stream was resumed after a
   * cut (see {@link resumeStreamTurn}), and a reply of chunks that began before
   * it would show from mid-word. Cleared by the next complete artifact.
   */
  skipPartialArtifacts?: boolean;
  /**
   * Where the partial chunks of an artifact began: its id, and the length of
   * {@link items} when its first chunk arrived. Its complete copy replaces the
   * text items those chunks were flushed into since (at a switch between
   * reasoning and answer), so they neither show twice nor keep an item with no
   * id the poll could pair. Internal.
   */
  partialArtifact?: { artifactId?: string; itemIndex: number };
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
    isFinal: false,
    carriesFile: false,
    revision: 0,
    openCalls: [],
    nextItemId: 0,
  };
}

/**
 * Whether the stream has delivered the end of the turn.
 *
 * Both executors close a turn with a terminal `status-update` (`final: true`),
 * which is {@link StreamTurn.isFinal}; a `task` snapshot already in a terminal
 * state counts too, for a stream opened onto a turn that had finished. A stream
 * that ends — cleanly or not — before this says true has been **lost**: the turn
 * goes on without its preview, and the poll is the only record of how it ends.
 */
export function isStreamTurnOver(turn: StreamTurn): boolean {
  if (turn.isFinal) {
    return true;
  }
  if (turn.stateKey === undefined) {
    return false;
  }
  const state = describeSessionState(turn.stateKey);
  return state !== undefined && !state.isActive;
}

/**
 * The turn as it stands where its stream was cut, ready to take the events of
 * a resubscription to its task.
 *
 * Everything already shown stays: a resubscription delivers the task's
 * snapshot (whose history is not ingested) and the events from then on, so
 * nothing on screen arrives twice, and a complete message that repeats one is
 * recognised by its `messageId`. Only an open run of **artifact chunks** goes —
 * one with no `messageId`, the Go executor's partial reply. The chunks sent
 * while no stream was open are gone, so the next ones would be glued onto it
 * with a hole in the middle; the complete artifact supersedes the run anyway,
 * from the resubscription or from the poll. A run a message opened is that
 * message's text as sent and keeps its place.
 *
 * Partial chunks are skipped from here until the next complete artifact: the
 * first one the resubscription delivers may be the middle of a reply, and a
 * preview starting mid-word reads as broken. The reply shows whole once its
 * complete artifact arrives.
 */
export function resumeStreamTurn(turn: StreamTurn): StreamTurn {
  const dropsRun = turn.live !== undefined && turn.live.messageId === undefined;
  return {
    ...turn,
    live: dropsRun ? undefined : turn.live,
    skipPartialArtifacts: true,
    revision: turn.revision + 1,
  };
}

/**
 * Fold one stream event into the turn. Pure: returns a new state, never throws
 * — an unreadable event returns the previous state with only `dispatched` set,
 * because even an event we cannot parse proves kagent is running the turn.
 *
 * Takes the event as the backend relayed it: an A2A v1 `StreamResponse` is
 * translated into the `kind`-discriminated shape first (`normalizeStreamEvent`
 * in agent-platform-common); a legacy event passes through.
 */
export function applyStreamEvent(turn: StreamTurn, data: unknown): StreamTurn {
  const parsed = a2aStreamEventWireSchema.safeParse(normalizeStreamEvent(data));
  if (!parsed.success) {
    return turn.dispatched ? turn : { ...turn, dispatched: true };
  }
  const event = parsed.data;
  const next: StreamTurn = {
    ...turn,
    dispatched: true,
    revision: turn.revision + 1,
    items: turn.items,
    openCalls: turn.openCalls,
  };
  if (!next.carriesFile && eventCarriesFile(event)) {
    next.carriesFile = true;
  }

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
      next.taskId ??= event.taskId;
      const state = event.status?.state?.toLowerCase();
      if (state) {
        next.stateKey = state;
      }
      const isFinal = event.final === true;
      if (isFinal) {
        next.isFinal = true;
      }

      if (
        isFinal &&
        state &&
        (FAILED_STATES.has(state) || state === CANCELED_STATE)
      ) {
        // The turn ended without answering, and `status.message` is now the
        // *reason*, not a reply. Ingesting it as one showed the provider's error
        // as the agent's prose for a moment — then the poll, whose history holds
        // no reply at all, replaced the preview with nothing and the error was
        // gone. Rendered instead as the ended-turn entry `buildTimeline` will
        // produce from the polled task, under the same messageId so that copy
        // supersedes this one.
        //
        // A cancel takes the same path so that pressing Stop settles into the
        // entry the poll is about to deliver, rather than leaving the partial
        // reply hanging and then having it vanish.
        flushLiveRun(next);
        pushEndingItem(next, state, readAgentMessage(event.status?.message));
        return next;
      }

      const message = readAgentMessage(event.status?.message);
      if (message) {
        if (isFinal) {
          // A run left open by an *earlier* message is a different sentence
          // entirely: it keeps its place ahead of whatever this event adds.
          if (next.live && next.live.messageId !== message.messageId) {
            flushLiveRun(next);
          }
          // What is left is this message's own run, which its complete copy
          // supersedes — unless that copy is skipped as already rendered, in
          // which case the run is the tail of it that no item holds yet.
          // Dropping the run either way lost that tail: text, a call, then more
          // text under one `messageId` emits items *and* leaves a run open.
          const live = next.live;
          next.live = undefined;
          if (!ingestCompleteMessage(next, message) && live) {
            next.live = live;
            flushLiveRun(next);
          }
        } else {
          ingestIncrementalMessage(next, message);
        }
      } else if (isFinal) {
        // A terminal event with no readable message still ends the live view —
        // leaving the run open would show "still typing" over a finished turn.
        flushLiveRun(next);
      }
      return next;
    }

    case 'artifact-update': {
      next.taskId ??= event.taskId;
      const parts = Array.isArray(event.artifact?.parts)
        ? event.artifact.parts
        : [];
      // The partial stamp lives on the event's own metadata bag, with the
      // artifact's as fallback — kagent's UI reads it in the same order.
      const partial =
        readKagentMetadata(event.metadata, 'partial') ??
        readKagentMetadata(event.artifact?.metadata, 'partial');
      // The complete response message (Go executor), or the closing sentinel
      // (whose text, when present, is the complete message — Python flow).
      const isComplete = partial === false || event.lastChunk === true;
      // What the poll keys this output by on API v2, where the agent's output
      // lands in `Task.artifacts` and each artifact reads back as a message
      // under its id (`artifactToWireMessage`). Without it the page cannot
      // recognise the polled copy, and renders the reply twice.
      const artifactId = event.artifact?.artifactId ?? undefined;
      // Who produced it, where the poll reads it from too.
      const artifactAuthor = readKagentMetadataString(
        event.artifact?.metadata,
        'author',
      );

      // The text read since the last call, as runs of one kind: an artifact can
      // carry the model's reasoning and then its answer, each its own item.
      const runs: TextRun[] = [];
      /**
       * Emit the complete message this event carries, at the position reached
       * so far.
       *
       * Only chunks that arrived *as artifacts* are what a complete artifact
       * supersedes: the open run without a `messageId`, and the items flushed
       * from this artifact's chunks before it ({@link StreamTurn.partialArtifact}).
       * A run opened by a message is someone else's sentence: this event has no
       * complete copy of it, so discarding it would erase it outright.
       *
       * Where that message is the same text (the Python flow: it arrived whole
       * on a status-update, and this event only repeats it), its run is flushed
       * under the message's own id, and `pushTextRuns` drops this copy as the
       * repeat.
       */
      const emitComplete = () => {
        next.skipPartialArtifacts = false;
        const live = next.live;
        const chunkRun = live?.messageId === undefined ? live : undefined;
        if (!chunkRun) {
          flushLiveRun(next);
        }
        next.live = undefined;
        const [superseded] = dropPartialArtifactItems(next, artifactId);
        // The chunks knew the author when the complete copy does not say.
        pushTextRuns(
          next,
          runs,
          artifactId,
          artifactAuthor ?? chunkRun?.author ?? superseded?.author,
        );
        runs.length = 0;
      };

      for (const segment of splitMessageParts(parts)) {
        if (segment.kind === 'text') {
          const kind = textKind(segment.isThought);
          runs.push({ kind, text: segment.text });
          if (partial === true && !next.skipPartialArtifacts) {
            if (next.partialArtifact?.artifactId !== artifactId) {
              next.partialArtifact = undefined;
            }
            if (!next.partialArtifact) {
              // Whatever is open is not this artifact's: it keeps its place
              // ahead of the chunks.
              flushLiveRun(next);
              next.partialArtifact = {
                artifactId,
                itemIndex: next.items.length,
              };
            }
            // Appended as the parts are read rather than after the loop: a
            // `function_call` later in this same event must not take its item
            // slot ahead of the text that came before it.
            appendLiveText(next, kind, segment.text, undefined, artifactAuthor);
          }
          continue;
        }
        // Tool activity can travel on artifacts too; it is complete whenever it
        // appears, whatever the partial stamp says about the text. Whatever was
        // said before it takes its position first.
        if (isComplete) {
          emitComplete();
        }
        ingestDataPart(next, segment.part, artifactAuthor, artifactId);
      }

      if (isComplete) {
        emitComplete();
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
 * Whether an event carries a file part anywhere: on its message, its artifact,
 * or, for a `task` snapshot, in the history and artifacts it repeats.
 */
function eventCarriesFile(event: A2aStreamEventWire): boolean {
  const partsOf = (value: unknown): unknown[] => {
    const parts = isRecord(value) ? value.parts : undefined;
    return Array.isArray(parts) ? parts : [];
  };
  const listOf = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [];
  const parts = [
    ...(event.parts ?? []),
    ...(event.artifact?.parts ?? []),
    ...partsOf(event.status?.message),
    ...listOf(event.history).flatMap(partsOf),
    ...listOf(event.artifacts).flatMap(partsOf),
  ];
  return parts.some(rawPart => {
    const part = parsePart(rawPart);
    return part !== undefined && readAttachment(part) !== undefined;
  });
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
 * merges them (`splitMessageParts`), data parts become call items.
 *
 * False when nothing of it was put on screen because it is already there: a
 * message whose items are, or whose text only repeats the items that end the
 * turn (the Go flow's terminal status update, see {@link pushTextRuns}).
 */
function ingestCompleteMessage(
  turn: StreamTurn,
  message: A2aMessageWire,
): boolean {
  // Already rendered: the terminal event repeats a message the incremental pass
  // has emitted items for. Reported back rather than silently skipped, because
  // "some of this message is on screen" is not "all of it is" — a caller
  // holding the rest has to know this copy will not deliver it.
  if (
    message.messageId &&
    turn.items.some(item => item.messageId === message.messageId)
  ) {
    return false;
  }
  if (ingestWorkspaceNotice(turn, message)) {
    return true;
  }
  const author = readKagentMetadataString(message.metadata, 'author');

  // Whether this copy put anything on screen, and whether it held text that
  // was not put there because it repeats what is.
  let rendered = false;
  let repeated = false;
  const runs: TextRun[] = [];
  const flushRuns = () => {
    if (!runs.some(run => run.text.trim())) {
      runs.length = 0;
      return;
    }
    if (pushTextRuns(turn, runs, message.messageId, author)) {
      rendered = true;
    } else {
      repeated = true;
    }
    runs.length = 0;
  };

  for (const segment of splitMessageParts(message.parts)) {
    if (segment.kind === 'text') {
      runs.push({ kind: textKind(segment.isThought), text: segment.text });
      continue;
    }
    flushRuns();
    rendered = true;
    ingestDataPart(turn, segment.part, author, message.messageId);
  }
  flushRuns();
  return rendered || !repeated;
}

/**
 * A non-final `status-update` message: its text parts are text still being
 * produced, so they accumulate in the open run, while its data parts are
 * complete from the start.
 *
 * **Part order is chronology.** A message that both says something and calls a
 * tool carries the text part first, so the open run is closed before the call
 * becomes an item — otherwise the call overtakes the sentence that introduced
 * it, which is what the whole turn then looks like: every tool row bunched
 * above every sentence.
 */
function ingestIncrementalMessage(turn: StreamTurn, message: A2aMessageWire) {
  if (ingestWorkspaceNotice(turn, message)) {
    return;
  }
  const author = readKagentMetadataString(message.metadata, 'author');
  for (const segment of splitMessageParts(message.parts)) {
    if (segment.kind === 'text') {
      appendLiveText(
        turn,
        textKind(segment.isThought),
        segment.text,
        message.messageId,
        author,
      );
      continue;
    }
    // A call, its result or a file ends the run, as it does in the poll, so
    // the text after it is the next item there too.
    flushLiveRun(turn);
    ingestDataPart(turn, segment.part, author, message.messageId);
  }
}

/**
 * A workspace setup notice, as the item `buildTimeline` makes of it, when the
 * message is one. It arrives whole on the turn's first `status-update`, so it
 * is never a run of text to extend: as one, it showed as the start of the
 * agent's reply.
 *
 * Only a message that opens the agent's side of the turn is tested, as on the
 * poll side (`NoticePosition`): nothing streamed yet but notices, so a repeat
 * of the notice still reads as one and is taken and dropped — by its id, or by
 * its text when it carries none. The test is skipped outright once the agent
 * has said anything, which keeps it off the per-delta path.
 */
function ingestWorkspaceNotice(
  turn: StreamTurn,
  message: A2aMessageWire,
): boolean {
  const opensTurn =
    turn.live === undefined &&
    turn.items.every(item => item.kind === 'workspace-notice');
  const notice = readWorkspaceNotice(message, { opensTurn });
  if (!notice) {
    return false;
  }
  const repeats = turn.items.some(item =>
    message.messageId
      ? item.messageId === message.messageId
      : item.kind === 'workspace-notice' && item.notice.text === notice.text,
  );
  if (repeats) {
    return true;
  }
  // Only a marked notice can find a run open.
  flushLiveRun(turn);
  turn.items = [
    ...turn.items,
    {
      kind: 'workspace-notice',
      id: `stream:${turn.nextItemId}`,
      taskIndex: 0,
      messageId: message.messageId,
      author: readKagentMetadataString(message.metadata, 'author'),
      notice,
    },
  ];
  turn.nextItemId += 1;
  return true;
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
  messageId: string | undefined,
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
      messageId,
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
  pushCallItem(turn, {
    name: effective.name,
    via: effective.via,
    args: effective.args,
    result: undefined,
    isPending: true,
    author,
    messageId,
  });
  if (call.id) {
    // Read after the push, not before: `pushCallItem` closes any open text run
    // first, so the call does not land at the index it would have without one.
    const itemIndex = turn.items.length - 1;
    turn.openCalls = [...turn.openCalls, { callId: call.id, itemIndex }];
  }
}

/**
 * Accumulate a chunk into the open run, starting one if none is open.
 *
 * A run ends where its text stops being one continuous thing: reasoning giving
 * way to a reply, or a new message. Either closes the run at its own position,
 * which is what stops two consecutive messages being rendered glued into one
 * paragraph.
 */
function appendLiveText(
  turn: StreamTurn,
  kind: 'agent-message' | 'reasoning',
  text: string,
  messageId: string | undefined,
  author: string | undefined,
) {
  const live = turn.live;
  if (live && (live.kind !== kind || live.messageId !== messageId)) {
    flushLiveRun(turn);
  }
  const open = turn.live;
  turn.live = open
    ? { ...open, text: open.text + text }
    : { kind, text, messageId, author };
}

/**
 * Close the open run as a completed item, at the position it holds now.
 *
 * Called before anything else is appended to {@link StreamTurn.items} — that is
 * the whole of how the preview stays in order.
 */
function flushLiveRun(turn: StreamTurn) {
  const live = turn.live;
  if (!live) {
    return;
  }
  turn.live = undefined;
  pushTextItem(turn, live.kind, live.text, live.messageId, live.author);
}

/** A run of text of one kind, as it becomes an item. */
type TextRun = { kind: LiveRun['kind']; text: string };

function textKind(isThought: boolean): LiveRun['kind'] {
  return isThought ? 'reasoning' : 'agent-message';
}

function isTextItem(
  item: TimelineItem,
): item is Extract<TimelineItem, { kind: LiveRun['kind'] }> {
  return item.kind === 'agent-message' || item.kind === 'reasoning';
}

/**
 * A run closed on its own, unless it repeats the item before it.
 *
 * The Go flow can deliver the same response twice — as the `partial: false`
 * artifact and again on the terminal status update — under two different ids,
 * the artifact's and the message's. Identical adjacent text is the tell.
 */
function pushTextItem(
  turn: StreamTurn,
  kind: LiveRun['kind'],
  text: string,
  messageId: string | undefined,
  author: string | undefined,
) {
  pushTextRuns(turn, [{ kind, text }], messageId, author);
}

/**
 * The text runs of one complete message, up to a call or to its end, as items
 * — unless they repeat the items the turn ends with, one for one, in kind and
 * text. Returns whether they were pushed.
 *
 * The repeat is the Go flow's: the complete artifact, and the terminal status
 * update after it carrying the same response under another id. A message of
 * reasoning and answer is two items, so comparing the last item alone would
 * show both again. Blank runs are skipped, as `buildTimeline` skips them.
 */
function pushTextRuns(
  turn: StreamTurn,
  runs: readonly TextRun[],
  messageId: string | undefined,
  author: string | undefined,
): boolean {
  const kept = runs
    .map(run => ({ kind: run.kind, text: run.text.trim() }))
    .filter(run => run.text);
  if (kept.length === 0) {
    return false;
  }
  const tail = turn.items.slice(-kept.length);
  const repeats =
    tail.length === kept.length &&
    tail.every(
      (item, index) =>
        isTextItem(item) &&
        item.kind === kept[index].kind &&
        item.text === kept[index].text,
    );
  if (repeats) {
    return false;
  }
  const added: TimelineItem[] = kept.map((run, index) => ({
    kind: run.kind,
    id: `stream:${turn.nextItemId + index}`,
    taskIndex: 0,
    messageId,
    author,
    text: run.text,
  }));
  turn.items = [...turn.items, ...added];
  turn.nextItemId += added.length;
  return true;
}

/**
 * Take out the text items flushed from an artifact's partial chunks, now that
 * its complete copy is here to replace them, and return them.
 *
 * Only items without a `messageId` from where the chunks began are the
 * artifact's: a call between them stays, and so does text a message brought.
 * The open calls' positions move with the items they point at.
 */
function dropPartialArtifactItems(
  turn: StreamTurn,
  artifactId: string | undefined,
): TimelineItem[] {
  const start = turn.partialArtifact;
  if (!start || start.artifactId !== artifactId) {
    return [];
  }
  turn.partialArtifact = undefined;
  const isChunk = (item: TimelineItem, index: number) =>
    index >= start.itemIndex &&
    isTextItem(item) &&
    item.messageId === undefined;
  const dropped = turn.items.filter(isChunk);
  if (dropped.length === 0) {
    return [];
  }
  const newIndex: number[] = [];
  let kept = 0;
  turn.items.forEach((item, index) => {
    newIndex[index] = kept;
    if (!isChunk(item, index)) {
      kept += 1;
    }
  });
  turn.items = turn.items.filter((item, index) => !isChunk(item, index));
  turn.openCalls = turn.openCalls.map(open => ({
    ...open,
    itemIndex: newIndex[open.itemIndex],
  }));
  return dropped;
}

/**
 * The terminal ending of a streamed turn — failed, rejected or canceled — as the
 * entry the polled timeline will carry. No adjacent-text dedupe: an ending is
 * never the repeat of an artifact chunk.
 */
function pushEndingItem(
  turn: StreamTurn,
  state: string,
  message: A2aMessageWire | undefined,
) {
  turn.items = [
    ...turn.items,
    {
      kind: 'turn-failed',
      id: `stream:${turn.nextItemId}`,
      taskIndex: 0,
      messageId: message?.messageId,
      author: message
        ? readKagentMetadataString(message.metadata, 'author')
        : undefined,
      state,
      reason: message ? readMessageText(message) : undefined,
    },
  ];
  turn.nextItemId += 1;
}

/**
 * Append a call item, closing whatever text was still open first.
 *
 * The close lives here rather than at the call sites because this is the exact
 * moment the ordering matters: a call item takes a position, and the text it
 * follows must have taken its own already. Data parts that yield no item — a
 * response folded into its pending call, ADK plumbing, an artifact sentinel's
 * placeholder — leave the run alone, because nothing overtook it.
 */
function pushCallItem(
  turn: StreamTurn,
  input: {
    name: string | undefined;
    via?: string;
    args: unknown;
    result: unknown;
    isPending: boolean;
    author: string | undefined;
    messageId: string | undefined;
  },
) {
  flushLiveRun(turn);
  const base = {
    id: `stream:${turn.nextItemId}`,
    taskIndex: 0,
    author: input.author,
    messageId: input.messageId,
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
 * Read one frame.
 *
 * Failures arrive **in-band**: a frame carrying `error` is how the relay says
 * the turn could not run or its stream broke (the backend writes one for a
 * gRPC failure mid-stream, with the code and the controller's message).
 * Distinguished here so the caller can treat it as a decision rather than a
 * broken pipe.
 *
 * An event frame is the A2A v1 `StreamResponse` itself; a legacy JSON-RPC
 * envelope (`{result}`) is unwrapped, so either relay reads the same.
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
  if ('result' in envelope) {
    return { kind: 'event', result: (envelope as { result?: unknown }).result };
  }
  return { kind: 'event', result: envelope };
}
