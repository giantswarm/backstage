import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { DevToolsModal } from '@assistant-ui/react-devtools';
import { Content, Header, Page } from '@backstage/core-components';
import {
  useApi,
  identityApiRef,
  discoveryApiRef,
} from '@backstage/core-plugin-api';
import { Thread } from './Thread';
import { useCallback } from 'react';
import {
  useChatRuntime,
  AssistantChatTransport,
} from '@assistant-ui/react-ai-sdk';
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import useAsync from 'react-use/esm/useAsync';

export const AiChatPage = () => {
  const identityApi = useApi(identityApiRef);
  const discoveryApi = useApi(discoveryApiRef);

  const { value: apiUrl } = useAsync(async () => {
    const baseUrl = await discoveryApi.getBaseUrl('ai-chat');

    return `${baseUrl}/chat`;
  }, [discoveryApi]);

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

  return (
    <Page themeId="service">
      <Header title="AI Chat" subtitle="Chat with AI assistant" />
      <Content>
        <AssistantRuntimeProvider runtime={runtime}>
          <DevToolsModal />
          <Thread />
        </AssistantRuntimeProvider>
      </Content>
    </Page>
  );
};
