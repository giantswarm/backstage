import { useCallback, useEffect, useState } from 'react';
import {
  AssistantRuntimeProvider,
  useAssistantApi,
  useThread,
} from '@assistant-ui/react';
import { useApi } from '@backstage/core-plugin-api';
import { useMediaQuery, useTheme } from '@material-ui/core';
import { aiChatDrawerApiRef } from '@giantswarm/backstage-plugin-ai-chat-react';
import { useChatSetup } from '../../hooks/useChatSetup';
import { AiChatDrawer, AiChatDrawerVariant } from './AiChatDrawer';

/**
 * Inner component that has access to the AssistantRuntimeProvider context.
 * Handles message appending when the drawer opens with a message.
 */
const DrawerInner = ({
  open,
  onClose,
  onNewConversation,
  pendingMessage,
  onMessageConsumed,
  variant,
}: {
  open: boolean;
  onClose(): void;
  onNewConversation(): void;
  pendingMessage: string | null;
  onMessageConsumed(): void;
  variant: AiChatDrawerVariant;
}) => {
  const assistantApi = useAssistantApi();
  const messageCount = useThread(state => state.messages.length);

  useEffect(() => {
    if (pendingMessage) {
      if (messageCount === 0) {
        assistantApi.thread().append({
          role: 'user',
          content: [{ type: 'text', text: pendingMessage }],
        });
      }
      onMessageConsumed();
    }
  }, [pendingMessage, assistantApi, messageCount, onMessageConsumed]);

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
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const { runtime } = useChatSetup();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const variant = isSmallScreen ? 'overlay' : 'persistent';

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleNewConversation = useCallback(() => {
    setRuntimeKey(prev => prev + 1);
  }, []);

  const handleMessageConsumed = useCallback(() => {
    setPendingMessage(null);
  }, []);

  // Register open/close handlers with the drawer API
  useEffect(() => {
    return drawerApi.registerHandler({
      openDrawer(message?: string) {
        setOpen(true);
        if (message) {
          setPendingMessage(message);
        }
      },
      closeDrawer() {
        setOpen(false);
      },
    });
  }, [drawerApi]);

  return (
    <AssistantRuntimeProvider key={runtimeKey} runtime={runtime}>
      <DrawerInner
        open={open}
        onClose={handleClose}
        onNewConversation={handleNewConversation}
        pendingMessage={pendingMessage}
        onMessageConsumed={handleMessageConsumed}
        variant={variant}
      />
    </AssistantRuntimeProvider>
  );
};
