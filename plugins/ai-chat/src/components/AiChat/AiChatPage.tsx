import { AssistantRuntimeProvider, useAssistantApi } from '@assistant-ui/react';
import { DevToolsModal } from '@assistant-ui/react-devtools';
import { Content, Header, Page } from '@backstage/core-components';
import {
  useApi,
  identityApiRef,
  discoveryApiRef,
  configApiRef,
} from '@backstage/core-plugin-api';
import { Thread } from './Thread';
import { useCallback, useEffect, useRef, useMemo } from 'react';
import {
  useChatRuntime,
  AssistantChatTransport,
} from '@assistant-ui/react-ai-sdk';
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import useAsync from 'react-use/esm/useAsync';
import { useSearchParams } from 'react-router-dom';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';

interface InitialMessageHandlerProps {
  isReady: boolean;
}

const InitialMessageHandler = ({ isReady }: InitialMessageHandlerProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const api = useAssistantApi();
  const hasSubmitted = useRef(false);

  useEffect(() => {
    const message = searchParams.get('message');
    if (message && isReady && !hasSubmitted.current) {
      hasSubmitted.current = true;
      api
        .thread()
        .append({ role: 'user', content: [{ type: 'text', text: message }] });
      setSearchParams(
        params => {
          params.delete('message');
          return params;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams, api, isReady]);

  return null;
};

export const AiChatPage = () => {
  const identityApi = useApi(identityApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const configApi = useApi(configApiRef);
  const gsAuthProvidersApi = useApi(gsAuthProvidersApiRef);

  const { value: apiUrl } = useAsync(async () => {
    const baseUrl = await discoveryApi.getBaseUrl('ai-chat');
    return `${baseUrl}/chat`;
  }, [discoveryApi]);

  // Parse MCP config once to extract auth providers
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

  // Get MCP authentication headers in parallel
  const getMCPAuthHeaders = useCallback(async () => {
    const mcpHeaders: { [key: string]: string } = {};

    const results = await Promise.allSettled(
      mcpAuthProviders.map(async authProvider => {
        const authApi = gsAuthProvidersApi.getAuthApi(authProvider);
        if (authApi) {
          const authToken = await authApi.getAccessToken();
          if (authToken) {
            return { authProvider, authToken };
          }
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
  }, [mcpAuthProviders, gsAuthProvidersApi]);

  // Get headers including MCP tokens
  const getHeaders = useCallback(async () => {
    const { token } = await identityApi.getCredentials();
    const mcpHeaders = await getMCPAuthHeaders();

    return {
      Authorization: `Bearer ${token}`,
      ...mcpHeaders,
    };
  }, [identityApi, getMCPAuthHeaders]);

  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: apiUrl,
      headers: getHeaders,
    }),
  });

  return (
    <Page themeId="service">
      <Header title="AI Chat" subtitle="Chat with AI assistant" />
      <Content>
        <AssistantRuntimeProvider runtime={runtime}>
          <InitialMessageHandler isReady={Boolean(apiUrl)} />
          <DevToolsModal />
          <Thread />
        </AssistantRuntimeProvider>
      </Content>
    </Page>
  );
};
