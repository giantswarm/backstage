import { AssistantRuntimeProvider, useAssistantApi } from '@assistant-ui/react';
import { DevToolsModal } from '@assistant-ui/react-devtools';
import { Content, Header, Page } from '@backstage/core-components';
import {
  useApi,
  identityApiRef,
  discoveryApiRef,
  configApiRef,
} from '@backstage/core-plugin-api';
import { mcpAuthProvidersApiRef } from '../../api';
import { Thread } from './Thread';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  useChatRuntime,
  AssistantChatTransport,
} from '@assistant-ui/react-ai-sdk';
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import useAsync from 'react-use/esm/useAsync';
import { useSearchParams } from 'react-router-dom';

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
  const mcpAuthProvidersApi = useApi(mcpAuthProvidersApiRef);

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
      <Header
        title="AI Assistant"
        subtitle="Your agentic interface to the Giant Swarm platform and developer portal"
      />
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
