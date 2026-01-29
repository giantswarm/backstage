import { AssistantRuntimeProvider, useAssistantApi } from '@assistant-ui/react';
import { DevToolsModal } from '@assistant-ui/react-devtools';
import { Content, Header, Page } from '@backstage/core-components';
import {
  useApi,
  identityApiRef,
  discoveryApiRef,
} from '@backstage/core-plugin-api';
import { Thread } from './Thread';
import { useCallback, useEffect, useRef } from 'react';
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
