import { AssistantRuntimeProvider, useAssistantApi } from '@assistant-ui/react';
import { DevToolsModal } from '@assistant-ui/react-devtools';
import { Content } from '@backstage/core-components';
import { Button, PluginHeader } from '@backstage/ui';
import { AIChatIcon } from '@giantswarm/backstage-plugin-ai-chat-react';
import { Thread } from './Thread';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useChatSetup } from '../../hooks/useChatSetup';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 'calc(100dvh - 52px)',
    [theme.breakpoints.down('xs')]: {
      minHeight: 'calc(100dvh - 52px - 56px)',
    },
    paddingBottom: 0,
  },
}));

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

const AiChatRuntime = () => {
  const classes = useStyles();
  const { runtime, isReady } = useChatSetup();

  return (
    <Content className={classes.root}>
      <AssistantRuntimeProvider runtime={runtime}>
        <InitialMessageHandler isReady={isReady} />
        <DevToolsModal />
        <Thread />
      </AssistantRuntimeProvider>
    </Content>
  );
};

export const AiChatPage = () => {
  const [runtimeKey, setRuntimeKey] = useState(0);

  const handleNewConversation = useCallback(() => {
    setRuntimeKey(prev => prev + 1);
  }, []);

  return (
    <>
      <PluginHeader
        title="AI Assistant"
        icon={<AIChatIcon fontSize="inherit" />}
        customActions={
          <Button variant="tertiary" onClick={handleNewConversation}>
            Clear conversation
          </Button>
        }
      />
      <AiChatRuntime key={runtimeKey} />
    </>
  );
};
