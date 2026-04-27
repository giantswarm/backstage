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
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useChatSetup } from '../../hooks/useChatSetup';
import { ChatRuntimeContext } from '../../hooks/ChatRuntimeContext';
import { useConversationListSync } from '../../hooks/useConversationListSync';
import { ConversationClient, ConversationApi } from '../../api';
import { ConversationHistoryPage } from '../ConversationHistory';
import { RecentConversations } from '../RecentConversations';
import { makeStyles } from '@material-ui/core';
import { RiAddLine } from '@remixicon/react';
import { QueryClientProvider } from '../QueryClientProvider';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    minHeight: 'calc(100dvh - 89px)',
    [theme.breakpoints.down('xs')]: {
      minHeight: 'calc(100dvh - 89px - 56px)',
    },
    paddingBottom: 0,
  },

  thread: {
    flex: 1,
  },

  sidebar: {
    width: 250,

    [theme.breakpoints.down('md')]: {
      width: 200,
    },

    [theme.breakpoints.down('sm')]: {
      display: 'none',
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

interface PageRuntimeProps {
  children: React.ReactNode;
  initialMessages?: UIMessage[];
  conversationId?: string;
}

const PageRuntime = ({
  children,
  initialMessages,
  conversationId,
}: PageRuntimeProps) => {
  const { runtime, isReady, getConversationId, isNewConversation } =
    useChatSetup({
      initialMessages,
      conversationId,
    });

  const contextValue = useMemo(
    () => ({ isReady, getConversationId, isNewConversation }),
    [isReady, getConversationId, isNewConversation],
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatRuntimeContext.Provider value={contextValue}>
        <InitialMessageHandler isReady={isReady} />
        <DevToolsModal />
        {children}
      </ChatRuntimeContext.Provider>
    </AssistantRuntimeProvider>
  );
};

const ConversationListSync = ({
  conversationApi,
}: {
  conversationApi: ConversationApi;
}) => {
  useConversationListSync(conversationApi);
  return null;
};

export const AiChatPage = () => {
  const classes = useStyles();
  const resolveRoot = useRouteRef(rootRouteRef);
  const resolveHistory = useRouteRef(historyRouteRef);
  const rootPath = resolveRoot?.() ?? '/ai-chat';
  const historyPath = resolveHistory?.() ?? '/ai-chat/history';

  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const conversationApi: ConversationApi = useMemo(
    () => new ConversationClient({ discoveryApi, fetchApi }),
    [discoveryApi, fetchApi],
  );

  // Derive active tab from URL
  const activeTab =
    location.pathname === historyPath ||
    location.pathname.startsWith(`${historyPath}/`)
      ? 'history'
      : 'chat';

  // Runtime state (lifted from former ChatTab, mirrors AiChatDrawerProvider)
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [loadedConversation, setLoadedConversation] = useState<{
    id: string;
    messages: UIMessage[];
  } | null>(null);
  const loadedRef = useRef<string | null>(null);

  // Load conversation from ?conversation=<id> query param
  const conversationIdParam = searchParams.get('conversation');

  useEffect(() => {
    if (conversationIdParam && conversationIdParam !== loadedRef.current) {
      loadedRef.current = conversationIdParam;
      conversationApi
        .getConversationById(conversationIdParam)
        .then(conv => {
          setLoadedConversation({ id: conv.id, messages: conv.messages });
          setRuntimeKey(prev => prev + 1);
          setSearchParams(
            params => {
              params.delete('conversation');
              return params;
            },
            { replace: true },
          );
        })
        .catch(() => {
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

  const handleNewConversation = useCallback(() => {
    setLoadedConversation(null);
    loadedRef.current = null;
    setRuntimeKey(prev => prev + 1);
    navigate(rootPath);
  }, [navigate, rootPath]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      try {
        const conv = await conversationApi.getConversationById(id);
        setLoadedConversation({ id: conv.id, messages: conv.messages });
        setRuntimeKey(prev => prev + 1);
        navigate(rootPath);
      } catch {
        setLoadedConversation(null);
        setRuntimeKey(prev => prev + 1);
        navigate(rootPath);
      }
    },
    [conversationApi, navigate, rootPath],
  );

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
    <QueryClientProvider>
      <PageRuntime
        key={runtimeKey}
        initialMessages={loadedConversation?.messages}
        conversationId={loadedConversation?.id}
      >
        <ConversationListSync conversationApi={conversationApi} />
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
        <div style={{ display: activeTab === 'chat' ? undefined : 'none' }}>
          <Content className={classes.root}>
            <div className={classes.thread}>
              <Thread />
            </div>
            <div className={classes.sidebar}>
              <RecentConversations
                conversationApi={conversationApi}
                selectedId={loadedConversation?.id}
                onSelectConversation={handleSelectConversation}
              />
            </div>
          </Content>
        </div>
        <div style={{ display: activeTab === 'history' ? undefined : 'none' }}>
          <ConversationHistoryPage
            conversationApi={conversationApi}
            onSelectConversation={handleSelectConversation}
          />
        </div>
      </PageRuntime>
    </QueryClientProvider>
  );
};
