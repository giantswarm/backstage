import { useState, useEffect, useCallback, useMemo } from 'react';
import useAsync from 'react-use/esm/useAsync';
import type {
  ConversationApi,
  ConversationListItem,
  ConversationRecord,
} from '../api';

export interface UseConversationsReturn {
  conversations: ConversationListItem[];
  starredConversations: ConversationListItem[];
  recentConversations: ConversationListItem[];
  loading: boolean;
  error?: string;
  loadConversation: (id: string) => Promise<ConversationRecord>;
  refreshConversations: () => void;
  deleteConversation: (id: string) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
}

export function useConversations(
  conversationApi: ConversationApi,
): UseConversationsReturn {
  const [refreshKey, setRefreshKey] = useState(0);
  const [localConversations, setLocalConversations] = useState<
    ConversationListItem[]
  >([]);

  const {
    value: fetchedConversations,
    loading,
    error,
  } = useAsync(async () => {
    try {
      const response = await conversationApi.getConversations();
      return response.conversations;
    } catch {
      return [];
    }
  }, [conversationApi, refreshKey]);

  useEffect(() => {
    if (fetchedConversations) {
      setLocalConversations(fetchedConversations);
    }
  }, [fetchedConversations]);

  const loadConversation = useCallback(
    async (id: string): Promise<ConversationRecord> => {
      return conversationApi.getConversationById(id);
    },
    [conversationApi],
  );

  const refreshConversations = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const deleteConversation = useCallback(
    async (id: string): Promise<void> => {
      const previousConversations = localConversations;
      setLocalConversations(prev => prev.filter(c => c.id !== id));

      try {
        await conversationApi.deleteConversation(id);
      } catch (err) {
        setLocalConversations(previousConversations);
        throw err;
      }
    },
    [conversationApi, localConversations],
  );

  const toggleStar = useCallback(
    async (id: string): Promise<void> => {
      const previousConversations = localConversations;
      setLocalConversations(prev =>
        prev.map(c => (c.id === id ? { ...c, isStarred: !c.isStarred } : c)),
      );

      try {
        await conversationApi.toggleConversationStar(id);
      } catch (err) {
        setLocalConversations(previousConversations);
        throw err;
      }
    },
    [conversationApi, localConversations],
  );

  const starredConversations = useMemo(
    () => localConversations.filter(c => c.isStarred),
    [localConversations],
  );

  const recentConversations = useMemo(
    () => localConversations.filter(c => !c.isStarred),
    [localConversations],
  );

  return {
    conversations: localConversations,
    starredConversations,
    recentConversations,
    loading,
    error: error?.message,
    loadConversation,
    refreshConversations,
    deleteConversation,
    toggleStar,
  };
}
