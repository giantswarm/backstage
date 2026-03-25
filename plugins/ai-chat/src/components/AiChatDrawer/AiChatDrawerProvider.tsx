import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AssistantRuntimeProvider, useAssistantApi } from '@assistant-ui/react';
import { useApi } from '@backstage/core-plugin-api';
import { useMediaQuery, useTheme } from '@material-ui/core';
import { aiChatDrawerApiRef } from '@giantswarm/backstage-plugin-ai-chat-react';
import { useChatSetup } from '../../hooks/useChatSetup';
import { AiChatDrawer, AiChatDrawerVariant } from './AiChatDrawer';

const RuntimeReadyContext = createContext(false);

/**
 * Owns the chat runtime. Keyed externally so that remounting creates a
 * completely fresh runtime (including internal zustand stores), which is
 * required for the thread to be ready when DrawerInner's mount effect fires.
 * Exposes isReady via context so DrawerInner can defer the initial append
 * until the API URL has been resolved.
 */
const AiChatRuntimeProvider = ({ children }: { children: ReactNode }) => {
  const { runtime, isReady } = useChatSetup();
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <RuntimeReadyContext.Provider value={isReady}>
        {children}
      </RuntimeReadyContext.Provider>
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
}: {
  open: boolean;
  onClose(): void;
  onNewConversation(): void;
  getAndClearPendingMessage(): string | null;
  variant: AiChatDrawerVariant;
}) => {
  const assistantApi = useAssistantApi();
  const isReady = useContext(RuntimeReadyContext);

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
    />
  );
};

export const AiChatDrawerProvider = () => {
  const drawerApi = useApi(aiChatDrawerApiRef);
  const [open, setOpen] = useState(false);
  const [runtimeKey, setRuntimeKey] = useState(0);
  const pendingMessageRef = useRef<string | null>(null);
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const variant = isSmallScreen ? 'overlay' : 'persistent';

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleNewConversation = useCallback(() => {
    setRuntimeKey(prev => prev + 1);
  }, []);

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
    <AiChatRuntimeProvider key={runtimeKey}>
      <DrawerInner
        open={open}
        onClose={handleClose}
        onNewConversation={handleNewConversation}
        getAndClearPendingMessage={getAndClearPendingMessage}
        variant={variant}
      />
    </AiChatRuntimeProvider>
  );
};
