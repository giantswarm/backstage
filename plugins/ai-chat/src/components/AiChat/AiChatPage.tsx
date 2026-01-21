import {
  AssistantRuntimeProvider,
  makeAssistantTool,
  tool,
  useAssistantApi,
} from '@assistant-ui/react';
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
import { z } from 'zod';
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

  // Get headers including MCP tokens
  const getHeaders = useCallback(async () => {
    const { token } = await identityApi.getCredentials();

    return {
      Authorization: `Bearer ${token}`,
    };
  }, [identityApi]);

  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: apiUrl,
      headers: getHeaders,
    }),
  });

  const mcpTools = useMemo(() => {
    const mcpConfigArray = configApi.getOptionalConfigArray('aiChat.mcp');
    if (!mcpConfigArray) {
      return [];
    }

    const tools: any[] = [];

    mcpConfigArray.forEach(serverConfig => {
      const authProvider = serverConfig.getOptionalString('authProvider');
      const authApi = gsAuthProvidersApi.getAuthApi(authProvider || '');
      if (authApi) {
        const mcpServerName = serverConfig.getString('name');
        const mcpServerDescription =
          serverConfig.getOptionalString('description');

        const mcpServer = mcpServerDescription
          ? `${mcpServerName} (${mcpServerDescription})`
          : mcpServerName;
        tools.push(
          tool({
            description: `Authenticate to access MCP server ${mcpServer}.`,
            parameters: z.object({}),
            execute: async () => {
              const token = await authApi.getAccessToken();

              return {
                success: true,
                message: `Authenticated to access MCP server ${mcpServer}.`,
                authProvider,
                token,
              };
            },
          }),
        );
      }
    });

    return tools;
  }, [configApi, gsAuthProvidersApi]);

  return (
    <Page themeId="service">
      <Header title="AI Chat" subtitle="Chat with AI assistant" />
      <Content>
        <AssistantRuntimeProvider runtime={runtime}>
          <InitialMessageHandler isReady={Boolean(apiUrl)} />
          <DevToolsModal />
          {mcpTools.map((mcpTool, index) => {
            const ToolComponent = makeAssistantTool({
              ...mcpTool,
              toolName: `mcp-auth-${index}`,
            });

            return <ToolComponent key={index} />;
          })}
          <Thread />
        </AssistantRuntimeProvider>
      </Content>
    </Page>
  );
};
