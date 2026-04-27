import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
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
import { useConversations } from '../../hooks/useConversations';
import {
  ConversationClient,
  ConversationApi,
  ConversationListItem,
} from '../../api';
import { AiChatDrawer, AiChatDrawerVariant } from './AiChatDrawer';
import { QueryClientProvider } from '../QueryClientProvider';

export type DrawerTab = 'chat' | 'history';

interface RuntimeContextValue {
  isReady: boolean;
  getConversationId: () => string | null;
  isNewConversation: boolean;
}

const RuntimeContext = createContext<RuntimeContextValue>({
  isReady: false,
  getConversationId: () => null,
  isNewConversation: true,
});

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
      <RuntimeContext.Provider value={value}>
        {children}
      </RuntimeContext.Provider>
    </AssistantRuntimeProvider>
  );
};

type ThreadMessage = {
  readonly role: string;
  readonly content: ReadonlyArray<{
    readonly type: string;
    readonly text?: string;
  }>;
};

function extractFirstUserText(messages: ReadonlyArray<ThreadMessage>): string {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return '';
  return firstUser.content
    .filter(p => p.type === 'text' && typeof p.text === 'string')
    .map(p => p.text as string)
    .join(' ')
    .trim();
}

/**
 * Keeps the conversation history list in sync with chat activity:
 * - On the first user message of a brand-new conversation, optimistically
 *   prepends a synthetic ConversationListItem so the entry shows up in the
 *   History tab immediately, before the backend has persisted the row.
 * - When the assistant stream finishes (isRunning transitions to false),
 *   invalidates the list query so the cached entry reconciles against the
 *   server's authoritative copy (real preview, real updatedAt).
 */
const useConversationListSync = (conversationApi: ConversationApi) => {
  const { getConversationId, isNewConversation } = useContext(RuntimeContext);
  const { addOptimisticConversation, refreshConversations } =
    useConversations(conversationApi);
  const insertedRef = useRef(false);
  const wasRunningRef = useRef(false);

  const isRunning = useAssistantState(({ thread }) =>
    Boolean(thread?.isRunning),
  );
  const messages = useAssistantState(
    ({ thread }) =>
      thread?.messages as ReadonlyArray<ThreadMessage> | undefined,
  );

  // Optimistic insert on the first user message of a new conversation.
  useEffect(() => {
    if (insertedRef.current) return;
    if (!isNewConversation) return;
    if (!messages || messages.length === 0) return;
    const firstUserText = extractFirstUserText(messages);
    if (!firstUserText) return;
    const id = getConversationId();
    if (!id) return;

    const now = new Date().toISOString();
    const optimistic: ConversationListItem = {
      id,
      userId: '',
      title: undefined,
      preview: firstUserText,
      isStarred: false,
      createdAt: now,
      updatedAt: now,
    };
    addOptimisticConversation(optimistic);
    insertedRef.current = true;
  }, [
    messages,
    isNewConversation,
    getConversationId,
    addOptimisticConversation,
  ]);

  // Reconcile with the server when the stream finishes.
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      refreshConversations();
    }
    wasRunningRef.current = isRunning;
  }, [isRunning, refreshConversations]);
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
  onSelectConversation(id: string): void;
}) => {
  const assistantApi = useAssistantApi();
  const { isReady } = useContext(RuntimeContext);

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

  return (
    <AiChatDrawer
      open={open}
      onClose={onClose}
      onNewConversation={onNewConversation}
      variant={variant}
      activeTab={activeTab}
      onTabChange={onTabChange}
      conversationApi={conversationApi}
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
  const pendingMessageRef = useRef<string | null>(null);
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
    setRuntimeKey(prev => prev + 1);
    setActiveTab('chat');
  }, []);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      try {
        const conv = await conversationApi.getConversationById(id);
        setLoadedConversation({ id: conv.id, messages: conv.messages });
        setRuntimeKey(prev => prev + 1);
        setActiveTab('chat');
      } catch {
        // If loading fails, start a fresh conversation
        setLoadedConversation(null);
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
          onSelectConversation={handleSelectConversation}
        />
      </AiChatRuntimeProvider>
    </QueryClientProvider>
  );
};
