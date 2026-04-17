import { useCallback, useMemo, useRef } from 'react';
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
import useAsync from 'react-use/esm/useAsync';
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

export function useChatSetup() {
  const identityApi = useApi(identityApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const configApi = useApi(configApiRef);
  const mcpAuthProvidersApi = useApi(mcpAuthProvidersApiRef);
  const featureFlagsApi = useApi(featureFlagsApiRef);
  const conversationIdRef = useRef<string | null>(null);

  const verboseDebugging = featureFlagsApi.isActive(
    'ai-chat-verbose-debugging',
  );
  const debugFetch = useMemo(
    () => (verboseDebugging ? createDebugFetch() : undefined),
    [verboseDebugging],
  );

  const { value: apiUrl } = useAsync(async () => {
    const baseUrl = await discoveryApi.getBaseUrl('ai-chat');
    return `${baseUrl}/chat`;
  }, [discoveryApi]);

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
    if (!conversationIdRef.current) {
      conversationIdRef.current = crypto.randomUUID();
      if (featureFlagsApi.isActive('ai-chat-verbose-debugging')) {
        // eslint-disable-next-line no-console
        console.log(
          `New AI Assistant conversation started with ID ${conversationIdRef.current}`,
        );
      }
    }

    const { token } = await identityApi.getCredentials();
    const mcpHeaders = await getMCPAuthHeaders();

    return {
      Authorization: `Bearer ${token}`,
      'X-Conversation-Id': conversationIdRef.current,
      ...(verboseDebugging && { 'X-AI-Chat-Debug': 'true' }),
      ...mcpHeaders,
    };
  }, [identityApi, getMCPAuthHeaders, featureFlagsApi, verboseDebugging]);

  const runtime = useChatRuntime({
    sendAutomaticallyWhen: shouldSendAutomatically,
    transport: new AssistantChatTransport({
      api: apiUrl,
      headers: getHeaders,
      fetch: debugFetch,
    }),
  });

  return { runtime, isReady: Boolean(apiUrl) };
}
