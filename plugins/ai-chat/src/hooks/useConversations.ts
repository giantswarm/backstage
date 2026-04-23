import { useState, useEffect, useCallback, useMemo } from 'react';
import useAsync from 'react-use/esm/useAsync';
import type {
  ConversationApi,
  ConversationListItem,
  ConversationRecord,
} from '../api';

function filterConversations(
  conversations: ConversationListItem[],
  query: string,
): ConversationListItem[] {
  const lowerQuery = query.toLowerCase();
  return conversations.filter(conv => {
    return conv.title?.toLowerCase().includes(lowerQuery);
  });
}

export interface UseConversationsReturn {
  conversations: ConversationListItem[];
  starredConversations: ConversationListItem[];
  recentConversations: ConversationListItem[];
  loading: boolean;
  error?: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;
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
  const [searchQuery, setSearchQuery] = useState('');

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

  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

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

  const conversations = useMemo(() => {
    if (searchQuery && searchQuery.length >= 2) {
      return filterConversations(localConversations, searchQuery);
    }
    return localConversations;
  }, [searchQuery, localConversations]);

  const starredConversations = useMemo(
    () => conversations.filter(c => c.isStarred),
    [conversations],
  );

  const recentConversations = useMemo(
    () => conversations.filter(c => !c.isStarred),
    [conversations],
  );

  return {
    conversations,
    starredConversations,
    recentConversations,
    loading,
    error: error?.message,
    searchQuery,
    setSearchQuery,
    clearSearch,
    loadConversation,
    refreshConversations,
    deleteConversation,
    toggleStar,
  };
}
