import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AssistantRuntimeProvider,
  useAssistantApi,
  useAssistantState,
} from '@assistant-ui/react';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { useMediaQuery, useTheme } from '@material-ui/core';
import { aiChatDrawerApiRef } from '@giantswarm/backstage-plugin-ai-chat-react';
import { UIMessage } from 'ai';
import { useChatSetup, UseChatSetupOptions } from '../../hooks/useChatSetup';
import {
  ChatRuntimeContext,
  useChatRuntimeContext,
} from '../../hooks/ChatRuntimeContext';
import { useConversationListSync } from '../../hooks/useConversationListSync';
import { ConversationClient, ConversationApi } from '../../api';
import { AiChatDrawer, AiChatDrawerVariant } from './AiChatDrawer';
import { QueryClientProvider } from '../QueryClientProvider';

export type DrawerTab = 'chat' | 'history';

/**
 * Owns the chat runtime. Keyed externally so that remounting creates a
 * completely fresh runtime (including internal zustand stores), which is
 * required for the thread to be ready when DrawerInner's mount effect fires.
 * Exposes isReady via context so DrawerInner can defer the initial append
 * until the API URL has been resolved.
 */
const AiChatRuntimeProvider = ({
  children,
  initialMessages,
  conversationId,
}: {
  children: ReactNode;
  initialMessages?: UseChatSetupOptions['initialMessages'];
  conversationId?: string;
}) => {
  const { runtime, isReady, getConversationId, isNewConversation } =
    useChatSetup({
      initialMessages,
      conversationId,
    });
  const value = useMemo(
    () => ({ isReady, getConversationId, isNewConversation }),
    [isReady, getConversationId, isNewConversation],
  );
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatRuntimeContext.Provider value={value}>
        {children}
      </ChatRuntimeContext.Provider>
    </AssistantRuntimeProvider>
  );
};

/**
 * Inner component that has access to the AssistantRuntimeProvider context.
 * Handles message appending when the drawer opens with a message.
 */
const DrawerInner = ({
  open,
  onClose,
  onNewConversation,
  getAndClearPendingMessage,
  variant,
  activeTab,
  onTabChange,
  conversationApi,
  activeConversationId,
  onActiveIdChange,
  onSelectConversation,
}: {
  open: boolean;
  onClose(): void;
  onNewConversation(): void;
  getAndClearPendingMessage(): string | null;
  variant: AiChatDrawerVariant;
  activeTab: DrawerTab;
  onTabChange(tab: DrawerTab): void;
  conversationApi: ConversationApi;
  activeConversationId?: string;
  onActiveIdChange(id: string): void;
  onSelectConversation(id: string): void;
}) => {
  const assistantApi = useAssistantApi();
  const { isReady, getConversationId } = useChatRuntimeContext();
  const messageCount = useAssistantState(
    ({ thread }) => thread?.messages?.length ?? 0,
  );

  useConversationListSync(conversationApi);

  // Append the pending message once the runtime is ready (apiUrl resolved).
  // Using [isReady] as the dep so this re-runs when the URL becomes available,
  // covering the case where the effect fires before the discovery API resolves.
  useEffect(() => {
    if (!isReady) return;
    const message = getAndClearPendingMessage();
    if (message) {
      assistantApi.thread().append({
        role: 'user',
        content: [{ type: 'text', text: message }],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  useEffect(() => {
    if (messageCount === 0) return;
    const id = getConversationId();
    if (id) onActiveIdChange(id);
  }, [messageCount, getConversationId, onActiveIdChange]);

  return (
    <AiChatDrawer
      open={open}
      onClose={onClose}
      onNewConversation={onNewConversation}
      variant={variant}
      activeTab={activeTab}
      onTabChange={onTabChange}
      conversationApi={conversationApi}
      activeConversationId={activeConversationId}
      onSelectConversation={onSelectConversation}
    />
  );
};

export const AiChatDrawerProvider = () => {
  const drawerApi = useApi(aiChatDrawerApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const [open, setOpen] = useState(false);
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [activeTab, setActiveTab] = useState<DrawerTab>('chat');
  const [loadedConversation, setLoadedConversation] = useState<{
    id: string;
    messages: UIMessage[];
  } | null>(null);
  const [newConversationId, setNewConversationId] = useState<
    string | undefined
  >();
  const pendingMessageRef = useRef<string | null>(null);

  const activeConversationId = loadedConversation?.id ?? newConversationId;

  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const variant = isSmallScreen ? 'overlay' : 'persistent';

  const conversationApi: ConversationApi = useMemo(
    () => new ConversationClient({ discoveryApi, fetchApi }),
    [discoveryApi, fetchApi],
  );

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleNewConversation = useCallback(() => {
    setLoadedConversation(null);
    setNewConversationId(undefined);
    setRuntimeKey(prev => prev + 1);
    setActiveTab('chat');
  }, []);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      try {
        const conv = await conversationApi.getConversationById(id);
        setLoadedConversation({ id: conv.id, messages: conv.messages });
        setNewConversationId(undefined);
        setRuntimeKey(prev => prev + 1);
        setActiveTab('chat');
      } catch {
        // If loading fails, start a fresh conversation
        setLoadedConversation(null);
        setNewConversationId(undefined);
        setRuntimeKey(prev => prev + 1);
        setActiveTab('chat');
      }
    },
    [conversationApi],
  );

  const getAndClearPendingMessage = useCallback(() => {
    const msg = pendingMessageRef.current;
    pendingMessageRef.current = null;
    return msg;
  }, []);

  // Register open/close handlers with the drawer API
  useEffect(() => {
    return drawerApi.registerHandler({
      openDrawer(message?: string) {
        setOpen(true);
        setActiveTab('chat');
        if (message) {
          pendingMessageRef.current = message;
          setRuntimeKey(prev => prev + 1);
        }
      },
      closeDrawer() {
        setOpen(false);
      },
      toggleDrawer() {
        setOpen(prev => !prev);
      },
    });
  }, [drawerApi]);

  return (
    <QueryClientProvider>
      <AiChatRuntimeProvider
        key={runtimeKey}
        initialMessages={loadedConversation?.messages}
        conversationId={loadedConversation?.id}
      >
        <DrawerInner
          open={open}
          onClose={handleClose}
          onNewConversation={handleNewConversation}
          getAndClearPendingMessage={getAndClearPendingMessage}
          variant={variant}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          conversationApi={conversationApi}
          activeConversationId={activeConversationId}
          onActiveIdChange={setNewConversationId}
          onSelectConversation={handleSelectConversation}
        />
      </AiChatRuntimeProvider>
    </QueryClientProvider>
  );
};
