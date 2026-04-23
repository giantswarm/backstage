import { AssistantRuntimeProvider, useAssistantApi } from '@assistant-ui/react';
import { DevToolsModal } from '@assistant-ui/react-devtools';
import { Content } from '@backstage/core-components';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Button, PluginHeader } from '@backstage/ui';
import {
  AIChatIcon,
  rootRouteRef,
  historyRouteRef,
} from '@giantswarm/backstage-plugin-ai-chat-react';
import { UIMessage } from 'ai';
import { Thread } from './Thread';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { useChatSetup } from '../../hooks/useChatSetup';
import { ConversationClient, ConversationApi } from '../../api';
import { ConversationHistoryPage } from '../ConversationHistory';
import { makeStyles } from '@material-ui/core';
import { RiAddLine } from '@remixicon/react';

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

interface AiChatRuntimeProps {
  initialMessages?: UIMessage[];
  conversationId?: string;
}

const AiChatRuntime = ({
  initialMessages,
  conversationId,
}: AiChatRuntimeProps) => {
  const classes = useStyles();
  const { runtime, isReady } = useChatSetup({
    initialMessages,
    conversationId,
  });

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

interface ChatTabProps {
  conversationApi: ConversationApi;
  newConversationKey: number;
}

const ChatTab = ({ conversationApi, newConversationKey }: ChatTabProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [loadedConversation, setLoadedConversation] = useState<{
    id: string;
    messages: UIMessage[];
  } | null>(null);

  // Load conversation from URL param
  const conversationIdParam = searchParams.get('conversation');
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (conversationIdParam && conversationIdParam !== loadedRef.current) {
      loadedRef.current = conversationIdParam;
      conversationApi
        .getConversationById(conversationIdParam)
        .then(conv => {
          setLoadedConversation({ id: conv.id, messages: conv.messages });
          setRuntimeKey(prev => prev + 1);
          // Clean up the URL param after loading
          setSearchParams(
            params => {
              params.delete('conversation');
              return params;
            },
            { replace: true },
          );
        })
        .catch(() => {
          // If loading fails, just start a fresh conversation
          setSearchParams(
            params => {
              params.delete('conversation');
              return params;
            },
            { replace: true },
          );
        });
    }
  }, [conversationIdParam, conversationApi, setSearchParams]);

  // Reset when parent signals a new conversation
  useEffect(() => {
    if (newConversationKey > 0) {
      setLoadedConversation(null);
      loadedRef.current = null;
      setRuntimeKey(prev => prev + 1);
    }
  }, [newConversationKey]);

  return (
    <AiChatRuntime
      key={runtimeKey}
      initialMessages={loadedConversation?.messages}
      conversationId={loadedConversation?.id}
    />
  );
};

const HistoryTab = ({
  conversationApi,
}: {
  conversationApi: ConversationApi;
}) => {
  const resolveRoot = useRouteRef(rootRouteRef);
  const rootPath = resolveRoot?.() ?? '/ai-chat';
  const navigate = useNavigate();

  const handleSelectConversation = useCallback(
    (id: string) => {
      navigate(`${rootPath}?conversation=${id}`);
    },
    [navigate, rootPath],
  );

  return (
    <ConversationHistoryPage
      conversationApi={conversationApi}
      onSelectConversation={handleSelectConversation}
    />
  );
};

export const AiChatPage = () => {
  const resolveRoot = useRouteRef(rootRouteRef);
  const resolveHistory = useRouteRef(historyRouteRef);
  const rootPath = resolveRoot?.() ?? '/ai-chat';
  const historyPath = resolveHistory?.() ?? '/ai-chat/history';

  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const conversationApi: ConversationApi = useMemo(
    () => new ConversationClient({ discoveryApi, fetchApi }),
    [discoveryApi, fetchApi],
  );

  const [newConversationKey, setNewConversationKey] = useState(0);

  const handleNewConversation = useCallback(() => {
    setNewConversationKey(prev => prev + 1);
  }, []);

  const tabs = useMemo(
    () => [
      {
        id: 'chat',
        label: 'Chat',
        href: rootPath,
        matchStrategy: 'exact' as const,
      },
      { id: 'history', label: 'History', href: historyPath },
    ],
    [rootPath, historyPath],
  );

  return (
    <>
      <PluginHeader
        title="AI Assistant"
        icon={<AIChatIcon fontSize="inherit" />}
        tabs={tabs}
        customActions={
          <Button
            variant="tertiary"
            iconStart={<RiAddLine />}
            onClick={handleNewConversation}
          >
            New chat
          </Button>
        }
      />
      <Routes>
        <Route
          path="/"
          element={
            <ChatTab
              conversationApi={conversationApi}
              newConversationKey={newConversationKey}
            />
          }
        />
        <Route
          path="/history"
          element={<HistoryTab conversationApi={conversationApi} />}
        />
      </Routes>
    </>
  );
};
