/* eslint-disable no-console */

/**
 * Creates a fetch wrapper that logs outgoing requests and incoming SSE
 * stream events to the browser console.  Designed to be passed as the
 * `fetch` option of `AssistantChatTransport` when the
 * `ai-chat-verbose-debugging` feature flag is active.
 *
 * All logging is wrapped in try/catch so it can never break the chat.
 */
export function createDebugFetch(): typeof globalThis.fetch {
  return async (input, init) => {
    // --- 1. Log the outgoing request ---
    try {
      if (init?.body) {
        const body = JSON.parse(init.body as string);
        const headers = init.headers as Record<string, string> | undefined;
        const safeHeaders = headers
          ? Object.fromEntries(
              Object.entries(headers).map(([k, v]) =>
                k.toLowerCase() === 'authorization'
                  ? [k, '[REDACTED]']
                  : [k, v],
              ),
            )
          : undefined;

        console.groupCollapsed(
          '%c[AI Chat Debug]%c Outgoing request',
          'color:#7c3aed;font-weight:bold',
          'color:inherit',
        );
        console.log('URL:', input);
        if (safeHeaders) console.log('Headers:', safeHeaders);
        console.log('Messages:', body.messages);
        if (body.tools && Object.keys(body.tools).length > 0) {
          console.log('Frontend tools:', body.tools);
        }
        // Log any extra body fields besides messages/tools
        const { messages: _m, tools: _t, ...rest } = body;
        if (Object.keys(rest).length > 0) {
          console.log('Other body fields:', rest);
        }
        console.groupEnd();
      }
    } catch {
      // Ignore logging errors
    }

    // --- 2. Execute the real fetch ---
    const response = await globalThis.fetch(input, init);

    // --- 3. Log backend debug metadata header ---
    try {
      const debugMeta = response.headers.get('X-AI-Chat-Debug-Meta');
      if (debugMeta) {
        const meta = JSON.parse(debugMeta);
        console.groupCollapsed(
          '%c[AI Chat Debug]%c Backend metadata',
          'color:#7c3aed;font-weight:bold',
          'color:inherit',
        );
        console.log('Model:', meta.model);
        console.log('Provider:', meta.provider);
        console.log(
          `System prompt: ${meta.systemPromptLength} chars`,
          meta.systemPromptPreview
            ? `\n${meta.systemPromptPreview}${meta.systemPromptLength > 500 ? '...' : ''}`
            : '',
        );
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
      }
    } catch {
      // Ignore parse/logging errors
    }

    // --- 4. Clone response and consume the clone for SSE logging ---
    try {
      const cloned = response.clone();
      consumeSSEStream(cloned).catch(() => {
        // Ignore stream read errors
      });
    } catch {
      // Ignore clone errors
    }

    return response;
  };
}

/**
 * Reads an SSE response body from a cloned Response and logs each event.
 */
interface StreamCounters {
  totalEvents: number;
  textDeltaChars: number;
  toolCalls: string[];
  reasoningDeltas: number;
  steps: number;
  lastFinishReason: string | undefined;
}

function handleEvent(parsed: any, counters: StreamCounters) {
  counters.totalEvents++;
  categorizeEvent(parsed, {
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
    },
  });
}

async function consumeSSEStream(response: Response): Promise<void> {
  const body = response.body;
  if (!body) return;

  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  const startTime = performance.now();

  const counters: StreamCounters = {
    totalEvents: 0,
    textDeltaChars: 0,
    toolCalls: [],
    reasoningDeltas: 0,
    steps: 0,
    lastFinishReason: undefined,
  };

  try {
    let result = await reader.read();
    while (!result.done) {
      buffer += result.value;

      // SSE events are separated by double newlines
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const eventBlock = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        processEventBlock(eventBlock, {
          onEvent(parsed) {
            handleEvent(parsed, counters);
          },
        });

        boundary = buffer.indexOf('\n\n');
      }

      result = await reader.read();
    }
  } finally {
    reader.releaseLock();
  }

  // --- Summary ---
  const duration = ((performance.now() - startTime) / 1000).toFixed(1);
  console.groupCollapsed(
    '%c[AI Chat Debug]%c Stream complete (%ss)',
    'color:#7c3aed;font-weight:bold',
    'color:inherit',
    duration,
  );
  console.log(`Total events: ${counters.totalEvents}`);
  console.log(`Text delta chars: ${counters.textDeltaChars}`);
  if (counters.toolCalls.length > 0) {
    console.log(`Tool calls: ${counters.toolCalls.join(', ')}`);
  }
  if (counters.reasoningDeltas > 0) {
    console.log(`Reasoning deltas: ${counters.reasoningDeltas}`);
  }
  if (counters.steps > 0) {
    console.log(`Steps: ${counters.steps}`);
  }
  if (counters.lastFinishReason) {
    console.log(`Finish reason: ${counters.lastFinishReason}`);
  }
  console.groupEnd();
}

/**
 * Parses a single SSE event block (lines between double-newline boundaries)
 * and calls the callback with the parsed JSON data.
 */
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
}

/**
 * Categorizes a parsed SSE event and updates counters.
 * Also logs the event to the console.
 */
function categorizeEvent(event: any, callbacks: EventCallbacks) {
  try {
    // The AI SDK UI message stream uses a type-based protocol.
    // Common types: text-delta, tool-call, tool-result, step-start,
    // step-finish, reasoning, finish, error
    const type = event.type ?? event.event ?? 'unknown';

    switch (type) {
      case 'text-delta':
        callbacks.onTextDelta(event.textDelta?.length ?? 0);
        // Don't log every text delta to avoid flooding
        break;
      case 'tool-call':
        callbacks.onToolCall(event.toolName ?? event.name ?? 'unknown');
        console.log(
          '%c[AI Chat Debug]%c Tool call: %s',
          'color:#7c3aed;font-weight:bold',
          'color:inherit',
          event.toolName ?? event.name,
          event.args ?? event.arguments,
        );
        break;
      case 'tool-result':
        console.log(
          '%c[AI Chat Debug]%c Tool result: %s',
          'color:#7c3aed;font-weight:bold',
          'color:inherit',
          event.toolName ?? event.toolCallId,
          event.result,
        );
        break;
      case 'step-start':
        callbacks.onStepStart();
        console.log(
          '%c[AI Chat Debug]%c Step start',
          'color:#7c3aed;font-weight:bold',
          'color:inherit',
        );
        break;
      case 'step-finish':
      case 'finish':
        if (event.finishReason) {
          callbacks.onFinish(event.finishReason);
        }
        console.log(
          '%c[AI Chat Debug]%c %s (reason: %s)',
          'color:#7c3aed;font-weight:bold',
          'color:inherit',
          type,
          event.finishReason ?? 'n/a',
          event.usage ?? '',
        );
        break;
      case 'reasoning':
      case 'reasoning-delta':
        callbacks.onReasoningDelta();
        // Don't log every reasoning delta to avoid flooding
        break;
      case 'error':
        console.error(
          '%c[AI Chat Debug]%c Stream error:',
          'color:#7c3aed;font-weight:bold',
          'color:inherit',
          event,
        );
        break;
      default:
        console.log(
          '%c[AI Chat Debug]%c SSE event [%s]:',
          'color:#7c3aed;font-weight:bold',
          'color:inherit',
          type,
          event,
        );
        break;
    }
  } catch {
    // Ignore categorization errors
  }
}
