/* eslint-disable no-console */

/**
 * Creates a fetch wrapper for the AI chat `AssistantChatTransport`.
 *
 * Two tiers of instrumentation are layered on top of `globalThis.fetch`:
 *
 * 1. **Always-on, non-sensitive network diagnostics.** Whenever the wrapper
 *    runs (it is installed unconditionally by `useChatSetup`) it logs the
 *    request URL, the response status and headers, fetch-level errors
 *    (`TypeError: Failed to fetch`, `AbortError`, TLS errors, etc.) and SSE
 *    stream lifecycle events, including premature termination without a
 *    `finish` event. None of this leaks the system prompt, message content,
 *    tool schemas, or any other backend internal -- it is safe to ship to
 *    production users so a "Network error" banner can be diagnosed by
 *    inspecting the browser console.
 *
 * 2. **Verbose mode**, gated by the `ai-chat-verbose-debugging` feature flag
 *    in non-production builds, additionally logs the request body
 *    (messages, frontend tools, other transport fields), the backend's
 *    `X-AI-Chat-Debug-Meta` payload (model, provider, system prompt, tool
 *    list, MCP servers) and a per-event categorised SSE log. This is the
 *    behaviour the previous `createDebugFetch()` had and continues to be
 *    useful when working on prompt or tool-call regressions.
 *
 * All logging is wrapped in try/catch -- diagnostics must never break the
 * chat.
 */

const PREFIX_STYLE = 'color:#7c3aed;font-weight:bold';
const RESET_STYLE = 'color:inherit';

interface CreateDebugFetchOptions {
  /**
   * When true, log message content, backend metadata and per-SSE-event
   * detail. Should be false in production builds because these payloads
   * include the system prompt and tool schemas.
   */
  verbose?: boolean;
  /**
   * Returns the current chat conversation id so log lines can be correlated
   * with the backend's structured logs.
   */
  getConversationId?: () => string | undefined;
}

export function createDebugFetch(
  options: CreateDebugFetchOptions = {},
): typeof globalThis.fetch {
  const { verbose = false, getConversationId } = options;

  return async (input, init) => {
    const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;
    const url = typeof input === 'string' ? input : (input as Request).url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const startedAt = performance.now();
    const conversationId = safeCall(getConversationId);
    // Tracks whether the caller's AbortSignal fired during this fetch's
    // lifetime, and what reason was attached. The AI SDK runtime
    // typically wires its own AbortController.signal here; observing it
    // tells us whether a stream that ended in `TypeError: network error`
    // was canceled by the runtime (deliberate abort with a reason -- e.g.
    // unmount, transport-rebuild, manual stop) or by a real network /
    // proxy-side disconnect (signal never aborted).
    const abortObservation: AbortObservation = {
      aborted: init?.signal?.aborted === true,
      reason: undefined,
      atMs: undefined,
    };
    const abortListener = () => {
      abortObservation.aborted = true;
      abortObservation.reason = init?.signal?.reason;
      abortObservation.atMs = performance.now() - startedAt;
      try {
        const reasonStr = formatAbortReason(init?.signal?.reason);
        console.warn(
          '%c[AI Chat]%c %s ABORT signaled by client at %sms%s -- reason: %s',
          PREFIX_STYLE,
          RESET_STYLE,
          requestId,
          abortObservation.atMs.toFixed(0),
          conversationId ? ` (conv ${conversationId})` : '',
          reasonStr,
        );
      } catch {
        // Ignore logging errors
      }
    };
    init?.signal?.addEventListener('abort', abortListener, { once: true });

    logRequestStart({ requestId, url, method, conversationId });

    if (verbose) {
      logVerboseRequestBody({ requestId, init });
    }

    let response: Response;
    try {
      response = await globalThis.fetch(input, init);
    } catch (err) {
      logFetchError({
        requestId,
        url,
        method,
        conversationId,
        elapsedMs: performance.now() - startedAt,
        err,
        aborted: init?.signal?.aborted === true,
      });
      throw err;
    }

    logResponseHeaders({
      requestId,
      conversationId,
      response,
      elapsedMs: performance.now() - startedAt,
    });

    if (verbose) {
      logVerboseBackendMetadata({ requestId, response });
    }

    try {
      const cloned = response.clone();
      void instrumentSSEStream({
        requestId,
        conversationId,
        response: cloned,
        verbose,
        abortObservation,
      });
    } catch {
      // Cloning a streaming Response can fail in rare browser edge cases;
      // never surface that to the chat.
    }

    return response;
  };
}

interface AbortObservation {
  aborted: boolean;
  reason: unknown;
  atMs: number | undefined;
}

function formatAbortReason(reason: unknown): string {
  if (reason === undefined || reason === null) return 'no reason';
  if (reason instanceof Error) {
    return `${reason.name}: ${reason.message}`;
  }
  if (typeof reason === 'string') return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

function safeCall<T>(fn: (() => T) | undefined): T | undefined {
  try {
    return fn?.();
  } catch {
    return undefined;
  }
}

function logRequestStart(args: {
  requestId: string;
  url: string;
  method: string;
  conversationId: string | undefined;
}) {
  try {
    console.log(
      '%c[AI Chat]%c %s %s %s%s',
      PREFIX_STYLE,
      RESET_STYLE,
      args.requestId,
      args.method,
      args.url,
      args.conversationId ? ` (conv ${args.conversationId})` : '',
    );
  } catch {
    // Ignore logging errors
  }
}

function logVerboseRequestBody(args: {
  requestId: string;
  init: RequestInit | undefined;
}) {
  try {
    if (!args.init?.body) return;
    const body = JSON.parse(args.init.body as string);
    const headers = args.init.headers as Record<string, string> | undefined;
    const safeHeaders = headers
      ? Object.fromEntries(
          Object.entries(headers).map(([k, v]) =>
            k.toLowerCase() === 'authorization' ||
            k.toLowerCase() === 'x-backstage-token' ||
            k.toLowerCase().startsWith('backstage-ai-chat-authorization-')
              ? [k, '[REDACTED]']
              : [k, v],
          ),
        )
      : undefined;

    console.groupCollapsed(
      '%c[AI Chat Debug]%c %s outgoing body',
      PREFIX_STYLE,
      RESET_STYLE,
      args.requestId,
    );
    if (safeHeaders) console.log('Headers:', safeHeaders);
    console.log('Messages:', body.messages);
    if (body.tools && Object.keys(body.tools).length > 0) {
      console.log('Frontend tools:', body.tools);
    }
    const { messages: _m, tools: _t, ...rest } = body;
    if (Object.keys(rest).length > 0) {
      console.log('Other body fields:', rest);
    }
    console.groupEnd();
  } catch {
    // Ignore logging errors
  }
}

function logFetchError(args: {
  requestId: string;
  url: string;
  method: string;
  conversationId: string | undefined;
  elapsedMs: number;
  err: unknown;
  aborted: boolean;
}) {
  try {
    const elapsed = args.elapsedMs.toFixed(0);
    const e = args.err as { name?: string; message?: string; stack?: string };
    console.error(
      '%c[AI Chat]%c %s FETCH FAILED after %sms %s %s%s\n  cause: %s: %s',
      PREFIX_STYLE,
      RESET_STYLE,
      args.requestId,
      elapsed,
      args.method,
      args.url,
      args.conversationId ? ` (conv ${args.conversationId})` : '',
      e?.name ?? typeof args.err,
      e?.message ?? String(args.err),
    );
    if (args.aborted) {
      console.error(
        '%c[AI Chat]%c %s aborted by client (user pressed Stop or component unmounted)',
        PREFIX_STYLE,
        RESET_STYLE,
        args.requestId,
      );
    }
    if (e?.stack) {
      console.error(
        '%c[AI Chat]%c %s stack:',
        PREFIX_STYLE,
        RESET_STYLE,
        args.requestId,
        e.stack,
      );
    }
  } catch {
    // Ignore logging errors
  }
}

const HEADERS_TO_LOG = [
  'content-type',
  'transfer-encoding',
  'cache-control',
  'connection',
  'x-conversation-id',
  'x-envoy-upstream-service-time',
  'x-envoy-attempt-count',
  'x-envoy-decorator-operation',
  'x-envoy-overloaded',
  'x-request-id',
  'server',
];

function logResponseHeaders(args: {
  requestId: string;
  conversationId: string | undefined;
  response: Response;
  elapsedMs: number;
}) {
  try {
    const headers: Record<string, string> = {};
    for (const name of HEADERS_TO_LOG) {
      const value = args.response.headers.get(name);
      if (value !== null) {
        headers[name] = value;
      }
    }

    const elapsed = args.elapsedMs.toFixed(0);
    const isOk = args.response.ok;
    const logger = isOk ? console.log : console.error;
    logger(
      '%c[AI Chat]%c %s response %d %s in %sms%s',
      PREFIX_STYLE,
      RESET_STYLE,
      args.requestId,
      args.response.status,
      args.response.statusText,
      elapsed,
      Object.keys(headers).length > 0
        ? ` headers=${JSON.stringify(headers)}`
        : '',
    );
  } catch {
    // Ignore logging errors
  }
}

function logVerboseBackendMetadata(args: {
  requestId: string;
  response: Response;
}) {
  try {
    const debugMeta = args.response.headers.get('X-AI-Chat-Debug-Meta');
    if (!debugMeta) return;

    // Decode base64 + utf-8 (needed for non-ASCII characters in the
    // system prompt or tool descriptions).
    const decoded = new TextDecoder('utf-8').decode(
      Uint8Array.from(atob(debugMeta), c => c.charCodeAt(0)),
    );
    const meta = JSON.parse(decoded);
    console.groupCollapsed(
      '%c[AI Chat Debug]%c %s backend metadata',
      PREFIX_STYLE,
      RESET_STYLE,
      args.requestId,
    );
    console.log('Model:', meta.model);
    console.log('Provider:', meta.provider);
    if (typeof meta.systemPrompt === 'string') {
      console.log(
        `System prompt (${meta.systemPrompt.length} chars):\n${meta.systemPrompt}`,
      );
    }
    console.log(`Tools (${meta.tools?.length ?? 0}):`, meta.tools);
    console.log('MCP servers:', meta.mcpServers);
    if (meta.providerOptions) {
      console.log('Provider options:', meta.providerOptions);
    }
    console.log('Messages after sanitization:', meta.messageCount);
    if (meta.hadUnsupportedContent) {
      console.warn('Unsupported content was stripped from messages');
    }
    console.groupEnd();
  } catch {
    // Ignore parse/logging errors
  }
}

interface StreamCounters {
  totalEvents: number;
  totalBytes: number;
  textDeltaChars: number;
  toolCalls: string[];
  reasoningDeltas: number;
  steps: number;
  lastFinishReason: string | undefined;
  sawFinish: boolean;
  sawErrorEvent: boolean;
  firstByteAtMs: number | undefined;
  lastEventAtMs: number | undefined;
  lastEventType: string | undefined;
}

async function instrumentSSEStream(args: {
  requestId: string;
  conversationId: string | undefined;
  response: Response;
  verbose: boolean;
  abortObservation: AbortObservation;
}): Promise<void> {
  const body = args.response.body;
  if (!body) return;

  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  const startTime = performance.now();

  const counters: StreamCounters = {
    totalEvents: 0,
    totalBytes: 0,
    textDeltaChars: 0,
    toolCalls: [],
    reasoningDeltas: 0,
    steps: 0,
    lastFinishReason: undefined,
    sawFinish: false,
    sawErrorEvent: false,
    firstByteAtMs: undefined,
    lastEventAtMs: undefined,
    lastEventType: undefined,
  };

  let readError: unknown = null;
  try {
    let result = await reader.read();
    while (!result.done) {
      if (counters.firstByteAtMs === undefined) {
        counters.firstByteAtMs = performance.now() - startTime;
      }
      counters.totalBytes += result.value.length;
      buffer += result.value;

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const eventBlock = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        processEventBlock(eventBlock, {
          onEvent(parsed) {
            handleEvent(parsed, counters, startTime, args.verbose);
          },
        });

        boundary = buffer.indexOf('\n\n');
      }

      result = await reader.read();
    }
  } catch (err) {
    readError = err;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Ignore lock release errors
    }
  }

  const totalDuration = performance.now() - startTime;
  reportStreamOutcome({
    requestId: args.requestId,
    conversationId: args.conversationId,
    counters,
    totalDurationMs: totalDuration,
    readError,
    abortObservation: args.abortObservation,
  });
}

function handleEvent(
  parsed: any,
  counters: StreamCounters,
  startTime: number,
  verbose: boolean,
) {
  counters.totalEvents++;
  counters.lastEventAtMs = performance.now() - startTime;
  categorizeEvent(parsed, verbose, {
    onTextDelta(chars) {
      counters.textDeltaChars += chars;
    },
    onToolCall(name) {
      if (!counters.toolCalls.includes(name)) counters.toolCalls.push(name);
    },
    onReasoningDelta() {
      counters.reasoningDeltas++;
    },
    onStepStart() {
      counters.steps++;
    },
    onFinish(reason) {
      counters.lastFinishReason = reason;
      counters.sawFinish = true;
    },
    onErrorEvent() {
      counters.sawErrorEvent = true;
    },
    onTypeSeen(type) {
      counters.lastEventType = type;
    },
  });
}

function reportStreamOutcome(args: {
  requestId: string;
  conversationId: string | undefined;
  counters: StreamCounters;
  totalDurationMs: number;
  readError: unknown;
  abortObservation: AbortObservation;
}) {
  const { counters } = args;
  const duration = (args.totalDurationMs / 1000).toFixed(1);
  const conv = args.conversationId ? ` (conv ${args.conversationId})` : '';
  const abortNote = args.abortObservation.aborted
    ? ` [client-aborted at ${args.abortObservation.atMs?.toFixed(0) ?? '?'}ms reason="${formatAbortReason(args.abortObservation.reason)}"]`
    : '';

  // Render the structured summary inline as a single JSON-shaped string so
  // it survives consumers that flatten the args[] array (Cursor's IDE
  // browser, log shippers that .join() the args, ...). Passing an object
  // as a trailing `console.error` argument renders nicely in Chrome
  // devtools but collapses to "[object Object]" everywhere else.
  const summaryFields = [
    `bytes=${counters.totalBytes}`,
    `events=${counters.totalEvents}`,
    `textDeltaChars=${counters.textDeltaChars}`,
    `reasoningDeltas=${counters.reasoningDeltas}`,
    `steps=${counters.steps}`,
    `toolCalls=[${counters.toolCalls.join(', ')}]`,
    `sawFinish=${counters.sawFinish}`,
    `finishReason=${counters.lastFinishReason ?? 'n/a'}`,
    `firstByteMs=${counters.firstByteAtMs?.toFixed(0) ?? 'n/a'}`,
    `lastEventMs=${counters.lastEventAtMs?.toFixed(0) ?? 'n/a'}`,
    `lastEventType=${counters.lastEventType ?? 'none'}`,
  ].join(' ');
  const summaryStr = `summary={${summaryFields}}`;

  if (args.readError) {
    const e = args.readError as { name?: string; message?: string };
    const errName = e?.name ?? typeof args.readError;
    const errMsg = e?.message ?? String(args.readError);

    if (counters.sawFinish) {
      // The stream emitted a `finish` event before the read errored, so
      // the assistant message was committed successfully. The teardown
      // error is then a post-completion artifact -- typically the AI
      // SDK aborting the underlying fetch to release the body once it
      // has finished consuming. Log informationally so it isn't
      // mistaken for a real network failure.
      console.warn(
        '%c[AI Chat]%c %s SSE stream torn down AFTER `finish` (post-completion teardown, message already committed) in %ss%s%s -- %s: %s %s',
        PREFIX_STYLE,
        RESET_STYLE,
        args.requestId,
        duration,
        conv,
        abortNote,
        errName,
        errMsg,
        summaryStr,
      );
      return;
    }

    if (args.abortObservation.aborted) {
      // The caller's AbortSignal fired before/while the stream was being
      // read. That's a deliberate client-side cancel (transport rebuild,
      // component unmount, manual stop, or a useChatRuntime that sees a
      // dependency change). Distinguish from a real network outage so
      // the banner can be classified correctly.
      console.warn(
        '%c[AI Chat]%c %s SSE stream cancelled by client AbortSignal after %ss%s%s -- %s: %s %s',
        PREFIX_STYLE,
        RESET_STYLE,
        args.requestId,
        duration,
        conv,
        abortNote,
        errName,
        errMsg,
        summaryStr,
      );
      return;
    }

    console.error(
      '%c[AI Chat]%c %s SSE STREAM READ FAILED after %ss%s%s -- %s: %s %s',
      PREFIX_STYLE,
      RESET_STYLE,
      args.requestId,
      duration,
      conv,
      abortNote,
      errName,
      errMsg,
      summaryStr,
    );
    return;
  }

  if (counters.sawErrorEvent) {
    console.error(
      '%c[AI Chat]%c %s SSE stream contained an `error` event after %ss%s %s',
      PREFIX_STYLE,
      RESET_STYLE,
      args.requestId,
      duration,
      conv,
      summaryStr,
    );
    return;
  }

  if (!counters.sawFinish && counters.totalEvents > 0) {
    console.warn(
      '%c[AI Chat]%c %s SSE stream ended WITHOUT a `finish` event after %ss%s -- last event was `%s` -- this is the typical fingerprint of a proxy / gateway stream timeout or upstream disconnect %s',
      PREFIX_STYLE,
      RESET_STYLE,
      args.requestId,
      duration,
      conv,
      counters.lastEventType ?? 'none',
      summaryStr,
    );
    return;
  }

  if (counters.totalEvents === 0) {
    console.warn(
      '%c[AI Chat]%c %s SSE stream produced no events after %ss%s -- response body closed without any data %s',
      PREFIX_STYLE,
      RESET_STYLE,
      args.requestId,
      duration,
      conv,
      summaryStr,
    );
    return;
  }

  console.log(
    '%c[AI Chat]%c %s SSE stream complete in %ss%s finish=%s events=%d bytes=%d toolCalls=[%s]',
    PREFIX_STYLE,
    RESET_STYLE,
    args.requestId,
    duration,
    conv,
    counters.lastFinishReason ?? 'n/a',
    counters.totalEvents,
    counters.totalBytes,
    counters.toolCalls.join(', '),
  );
}

function processEventBlock(
  block: string,
  { onEvent }: { onEvent: (data: any) => void },
) {
  try {
    const lines = block.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6);
        if (jsonStr === '[DONE]') return;
        const parsed = JSON.parse(jsonStr);
        onEvent(parsed);
      }
    }
  } catch {
    // Ignore parse errors for individual events
  }
}

interface EventCallbacks {
  onTextDelta: (chars: number) => void;
  onToolCall: (name: string) => void;
  onReasoningDelta: () => void;
  onStepStart: () => void;
  onFinish: (reason: string) => void;
  onErrorEvent: () => void;
  onTypeSeen: (type: string) => void;
}

function categorizeEvent(
  event: any,
  verbose: boolean,
  callbacks: EventCallbacks,
) {
  try {
    // The AI SDK UI message stream uses a type-based protocol.
    // Common types: text-delta, tool-call, tool-result, step-start,
    // step-finish, reasoning, finish, error
    const type = event.type ?? event.event ?? 'unknown';
    callbacks.onTypeSeen(type);

    switch (type) {
      case 'text-delta':
        callbacks.onTextDelta(event.textDelta?.length ?? 0);
        break;
      case 'tool-call':
        callbacks.onToolCall(event.toolName ?? event.name ?? 'unknown');
        if (verbose) {
          console.log(
            '%c[AI Chat Debug]%c Tool call: %s',
            PREFIX_STYLE,
            RESET_STYLE,
            event.toolName ?? event.name,
            event.args ?? event.arguments,
          );
        }
        break;
      case 'tool-result':
        if (verbose) {
          console.log(
            '%c[AI Chat Debug]%c Tool result: %s',
            PREFIX_STYLE,
            RESET_STYLE,
            event.toolName ?? event.toolCallId,
            event.result,
          );
        }
        break;
      case 'step-start':
        callbacks.onStepStart();
        if (verbose) {
          console.log(
            '%c[AI Chat Debug]%c Step start',
            PREFIX_STYLE,
            RESET_STYLE,
          );
        }
        break;
      case 'step-finish':
      case 'finish':
        if (event.finishReason) {
          callbacks.onFinish(event.finishReason);
        } else {
          // The `step-finish` / `finish` envelope alone is enough to consider
          // the stream cleanly terminated, even when the SDK omits a reason.
          callbacks.onFinish('unspecified');
        }
        if (verbose) {
          console.log(
            '%c[AI Chat Debug]%c %s (reason: %s)',
            PREFIX_STYLE,
            RESET_STYLE,
            type,
            event.finishReason ?? 'n/a',
            event.usage ?? '',
          );
        }
        break;
      case 'reasoning':
      case 'reasoning-delta':
        callbacks.onReasoningDelta();
        break;
      case 'error':
        callbacks.onErrorEvent();
        console.error(
          '%c[AI Chat]%c SSE error event:',
          PREFIX_STYLE,
          RESET_STYLE,
          event,
        );
        break;
      default:
        if (verbose) {
          console.log(
            '%c[AI Chat Debug]%c SSE event [%s]:',
            PREFIX_STYLE,
            RESET_STYLE,
            type,
            event,
          );
        }
        break;
    }
  } catch {
    // Ignore categorization errors
  }
}
