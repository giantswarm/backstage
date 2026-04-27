import { createContext, useContext } from 'react';

export interface ChatRuntimeContextValue {
  isReady: boolean;
  getConversationId: () => string | null;
  isNewConversation: boolean;
}

export const ChatRuntimeContext = createContext<ChatRuntimeContextValue>({
  isReady: false,
  getConversationId: () => null,
  isNewConversation: true,
});

export const useChatRuntimeContext = () => useContext(ChatRuntimeContext);
