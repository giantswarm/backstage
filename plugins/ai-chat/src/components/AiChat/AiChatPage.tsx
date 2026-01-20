import { AssistantRuntimeProvider, useAssistantApi } from '@assistant-ui/react';
import { DevToolsModal } from '@assistant-ui/react-devtools';
import { Content, Header, Page } from '@backstage/core-components';
import {
  useApi,
  identityApiRef,
  discoveryApiRef,
} from '@backstage/core-plugin-api';
import { Thread } from './Thread';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  useChatRuntime,
  AssistantChatTransport,
} from '@assistant-ui/react-ai-sdk';
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import useAsync from 'react-use/esm/useAsync';
import { useSearchParams } from 'react-router-dom';
import { mcpAuthApiRef, McpServer } from '../../api';
import { McpServerSelector } from './McpServerSelector';

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

/**
 * State for MCP server connections
 */
interface McpConnection {
  server: McpServer;
  accessToken: string;
}

export const AiChatPage = () => {
  const identityApi = useApi(identityApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const mcpAuthApi = useApi(mcpAuthApiRef);

  // State for MCP server connections
  const [mcpConnections, setMcpConnections] = useState<McpConnection[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);

  // Load available MCP servers
  const { value: mcpServers = [] } = useAsync(async () => {
    return mcpAuthApi.getServers();
  }, [mcpAuthApi]);

  const { value: apiUrl } = useAsync(async () => {
    const baseUrl = await discoveryApi.getBaseUrl('ai-chat');
    return `${baseUrl}/chat`;
  }, [discoveryApi]);

  // Handle connecting to an MCP server
  const handleConnectServer = useCallback(
    async (server: McpServer) => {
      setIsConnecting(true);
      try {
        const accessToken = await mcpAuthApi.getAccessToken(server.name);
        setMcpConnections(prev => {
          // Replace existing connection for this server
          const filtered = prev.filter(c => c.server.name !== server.name);
          return [...filtered, { server, accessToken }];
        });
      } catch {
        // User cancelled or auth failed - silently ignore
      } finally {
        setIsConnecting(false);
      }
    },
    [mcpAuthApi],
  );

  // Handle disconnecting from an MCP server
  const handleDisconnectServer = useCallback(
    async (serverName: string) => {
      try {
        await mcpAuthApi.signOut(serverName);
      } catch {
        // Ignore sign out errors
      }
      setMcpConnections(prev => prev.filter(c => c.server.name !== serverName));
    },
    [mcpAuthApi],
  );

  // Get headers including MCP tokens
  const getHeaders = useCallback(async () => {
    const { token } = await identityApi.getCredentials();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    // Add MCP tokens as JSON-encoded header
    if (mcpConnections.length > 0) {
      const mcpTokens = mcpConnections.reduce(
        (acc, conn) => {
          acc[conn.server.name] = conn.accessToken;
          return acc;
        },
        {} as Record<string, string>,
      );
      headers['X-MCP-Tokens'] = JSON.stringify(mcpTokens);
    }

    return headers;
  }, [identityApi, mcpConnections]);

  // Create transport - recreate when connections change
  const transport = useMemo(() => {
    return new AssistantChatTransport({
      api: apiUrl,
      headers: getHeaders,
    });
  }, [apiUrl, getHeaders]);

  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport,
  });

  // Build subtitle showing connected servers
  const subtitle = useMemo(() => {
    if (mcpConnections.length === 0) {
      return 'Chat with AI assistant';
    }
    const serverNames = mcpConnections
      .map(c => c.server.displayName)
      .join(', ');
    return `Connected to: ${serverNames}`;
  }, [mcpConnections]);

  return (
    <Page themeId="service">
      <Header title="AI Chat" subtitle={subtitle}>
        <McpServerSelector
          servers={mcpServers}
          connections={mcpConnections}
          onConnect={handleConnectServer}
          onDisconnect={handleDisconnectServer}
          isConnecting={isConnecting}
        />
      </Header>
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
