import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  useApi,
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

  // Verbose debugging is only enabled in non-production builds to avoid
  // leaking backend internals (system prompt, tool schemas) to end users
  // who toggle the feature flag in production.
  const verboseDebugging =
    process.env.NODE_ENV !== 'production' &&
    featureFlagsApi.isActive('ai-chat-verbose-debugging');
  const debugFetch = useMemo(
    () => (verboseDebugging ? createDebugFetch() : undefined),
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

  const runtime = useChatRuntime({
    messages: options?.initialMessages,
    sendAutomaticallyWhen: shouldSendAutomatically,
    transport: new AssistantChatTransport({
      api: apiUrl,
      headers: getHeaders,
      fetch: debugFetch,
    }),
  });

  return {
    runtime,
    isReady: Boolean(apiUrl),
    getConversationId,
    isNewConversation,
  };
}
