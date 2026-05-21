import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  useApi,
  useApiHolder,
  identityApiRef,
  discoveryApiRef,
  configApiRef,
  featureFlagsApiRef,
} from '@backstage/core-plugin-api';
import {
  useChatRuntime,
  AssistantChatTransport,
} from '@assistant-ui/react-ai-sdk';
import {
  lastAssistantMessageIsCompleteWithToolCalls,
  isToolUIPart,
  getToolName,
  UIMessage,
} from 'ai';
import { useQuery } from '@tanstack/react-query';
import { errorReporterApiRef } from '@giantswarm/backstage-plugin-error-reporter-react';
import { mcpAuthProvidersApiRef } from '../api';
import { createDebugFetch } from './createDebugFetch';

/**
 * Tools whose results are rendered as self-contained UI cards.
 * When the last assistant step contains ONLY these tools, we skip the
 * automatic re-send so the model does not generate redundant prose.
 */
const SELF_RENDERING_TOOLS = new Set(['getContextUsage']);

function shouldSendAutomatically({
  messages,
}: {
  messages: UIMessage[];
}): boolean {
  if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) {
    return false;
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'assistant') return false;

  const lastStepStart = lastMessage.parts.reduce(
    (idx, part, i) => (part.type === 'step-start' ? i : idx),
    -1,
  );

  const toolParts = lastMessage.parts
    .slice(lastStepStart + 1)
    .filter(isToolUIPart);

  if (
    toolParts.length > 0 &&
    toolParts.every(part => SELF_RENDERING_TOOLS.has(getToolName(part)))
  ) {
    return false;
  }

  return true;
}

export interface UseChatSetupOptions {
  initialMessages?: UIMessage[];
  conversationId?: string;
}

export function useChatSetup(options?: UseChatSetupOptions) {
  const identityApi = useApi(identityApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const configApi = useApi(configApiRef);
  const mcpAuthProvidersApi = useApi(mcpAuthProvidersApiRef);
  const featureFlagsApi = useApi(featureFlagsApiRef);
  // Optional: the error reporter is only registered when
  // `app.errorReporter.sentry` is configured. Use the api holder so the
  // chat still works in environments without Sentry wiring.
  const errorReporter = useApiHolder().get(errorReporterApiRef);
  // Generate the conversation id eagerly so getConversationId() never returns
  // null while the first user message is in flight. This lets the optimistic
  // history-list insert (useConversationListSync) fire on the first message,
  // not after the first assistant token arrives.
  const conversationIdRef = useRef<string>(
    options?.conversationId ?? crypto.randomUUID(),
  );
  const isNewConversation = !options?.conversationId;
  const getConversationId = useCallback(() => conversationIdRef.current, []);

  useEffect(() => {
    if (
      isNewConversation &&
      featureFlagsApi.isActive('ai-chat-verbose-debugging')
    ) {
      // eslint-disable-next-line no-console
      console.log(
        `New AI Assistant conversation started with ID ${conversationIdRef.current}`,
      );
    }
  }, [isNewConversation, featureFlagsApi]);

  // Verbose debugging adds payload-level inspection (request body, system
  // prompt, tool schemas, per-event SSE log). It must stay gated on
  // non-production builds because those payloads include the system prompt
  // and tool descriptions; even with the feature flag toggled they should
  // not leak to end users on a production deployment.
  const verboseDebugging =
    process.env.NODE_ENV !== 'production' &&
    featureFlagsApi.isActive('ai-chat-verbose-debugging');
  // The lightweight network-diagnostic tier is always installed: it logs
  // request URLs, response status / headers, fetch errors and SSE stream
  // termination details (clean finish vs. premature close vs. error event)
  // to the browser console. None of this exposes message content or backend
  // internals -- it is the minimum needed to triage a "Network error"
  // banner from a user report.
  const debugFetch = useMemo(
    () =>
      createDebugFetch({
        verbose: verboseDebugging,
        getConversationId: () => conversationIdRef.current,
      }),
    [verboseDebugging],
  );

  const { data: apiUrl } = useQuery({
    queryKey: ['ai-chat', 'api-url'],
    queryFn: async () => {
      const baseUrl = await discoveryApi.getBaseUrl('ai-chat');
      return `${baseUrl}/chat`;
    },
    staleTime: Infinity,
  });

  const mcpAuthProviders = useMemo(() => {
    const mcpServers = configApi.getOptionalConfigArray('aiChat.mcp');
    if (!mcpServers) {
      return [];
    }

    const providers: string[] = [];
    for (const serverConfig of mcpServers) {
      const authProvider = serverConfig.getOptionalString('authProvider');
      if (authProvider && !providers.includes(authProvider)) {
        providers.push(authProvider);
      }
    }

    return providers;
  }, [configApi]);

  const getMCPAuthHeaders = useCallback(async () => {
    const mcpHeaders: { [key: string]: string } = {};

    const results = await Promise.allSettled(
      mcpAuthProviders.map(async authProvider => {
        const credentials =
          await mcpAuthProvidersApi.getCredentials(authProvider);
        if (credentials.token) {
          return { authProvider, authToken: credentials.token };
        }

        return null;
      }),
    );

    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        const { authProvider, authToken } = result.value;
        mcpHeaders[`backstage-ai-chat-authorization-${authProvider}`] =
          authToken;
      }
    });

    return mcpHeaders;
  }, [mcpAuthProviders, mcpAuthProvidersApi]);

  const getHeaders = useCallback(async () => {
    const { token } = await identityApi.getCredentials();
    const mcpHeaders = await getMCPAuthHeaders();

    return {
      'X-Backstage-Token': `Bearer ${token}`,
      'X-Conversation-Id': conversationIdRef.current,
      ...(verboseDebugging && { 'X-AI-Chat-Debug': 'true' }),
      ...mcpHeaders,
    };
  }, [identityApi, getMCPAuthHeaders, verboseDebugging]);

  // The transport must be stable across renders. `useChatRuntime` keeps an
  // internal AbortController per in-flight stream and tears it down when the
  // transport identity changes; constructing a new transport on every render
  // (even with logically identical config) was observed to cancel
  // mid-stream chat fetches with a `TypeError: network error` (Envoy logs
  // `response_flags: DC` against the Backstage upstream while
  // `sawFinish=false` and the model was actively emitting
  // `reasoning-delta` / `tool-input-delta` events). Memoising on the
  // resolved api URL and the stable `getHeaders` / `debugFetch` callbacks
  // keeps a single transport for the lifetime of the component.
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: apiUrl,
        headers: getHeaders,
        fetch: debugFetch,
      }),
    [apiUrl, getHeaders, debugFetch],
  );

  // Forward chat-level errors (raised by the AI SDK after fetch/stream
  // failures or non-OK responses) to the error reporter. Aborts are
  // filtered out upstream by the SDK before this fires. Network-class
  // failures use the same TypeError + /fetch|network/i fingerprint the
  // SDK uses internally; they are reported as warnings to avoid paging
  // on every flaky-wifi user, while genuinely unexpected errors are
  // reported as errors.
  const onError = useCallback(
    (err: Error) => {
      if (!errorReporter) return;
      const isNetworkError =
        err instanceof TypeError && /fetch|network/i.test(err.message);
      errorReporter.notify(err, {
        level: isNetworkError ? 'warning' : 'error',
        source: 'ai-chat',
        conversationId: conversationIdRef.current,
        isNetworkError,
      });
    },
    [errorReporter],
  );

  const runtime = useChatRuntime({
    messages: options?.initialMessages,
    sendAutomaticallyWhen: shouldSendAutomatically,
    transport,
    onError,
  });

  return {
    runtime,
    isReady: Boolean(apiUrl),
    getConversationId,
    isNewConversation,
  };
}
