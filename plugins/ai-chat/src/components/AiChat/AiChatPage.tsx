import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Content, Header, Page } from '@backstage/core-components';
import { Thread } from './Thread';
import { useAiChatRuntime } from './useAiChatRuntime';

export const AiChatPage = () => {
  const runtime = useAiChatRuntime();

  return (
    <Page themeId="tool">
      <Header title="AI Chat" subtitle="Chat with AI assistant" />
      <Content>
        <AssistantRuntimeProvider runtime={runtime}>
          <Thread />
        </AssistantRuntimeProvider>
      </Content>
    </Page>
  );
};
