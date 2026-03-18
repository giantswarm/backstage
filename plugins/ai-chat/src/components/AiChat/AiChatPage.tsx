import { AssistantRuntimeProvider, useAssistantApi } from '@assistant-ui/react';
import { DevToolsModal } from '@assistant-ui/react-devtools';
import { Content, Header, Page } from '@backstage/core-components';
import { Thread } from './Thread';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useChatSetup } from '../../hooks/useChatSetup';

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
  const { runtime, isReady } = useChatSetup();

  return (
    <Page themeId="service">
      <Header
        title="AI Assistant"
        subtitle="Your agentic interface to the Giant Swarm platform and developer portal"
      />
      <Content>
        <AssistantRuntimeProvider runtime={runtime}>
          <InitialMessageHandler isReady={isReady} />
          <DevToolsModal />
          <Thread />
        </AssistantRuntimeProvider>
      </Content>
    </Page>
  );
};
