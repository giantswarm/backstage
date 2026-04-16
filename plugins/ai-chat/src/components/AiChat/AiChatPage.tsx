import { AssistantRuntimeProvider, useAssistantApi } from '@assistant-ui/react';
import { DevToolsModal } from '@assistant-ui/react-devtools';
import { Content } from '@backstage/core-components';
import { Thread } from './Thread';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useChatSetup } from '../../hooks/useChatSetup';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  root: {
    height: 'calc(100dvh - 52px)',
    [theme.breakpoints.down('xs')]: {
      height: 'calc(100dvh - 52px - 56px)',
    },
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

export const AiChatPage = () => {
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
