import { useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ConversationApi,
  ConversationListItem,
  ConversationRecord,
} from '../api';

export interface UseConversationsReturn {
  conversations: ConversationListItem[];
  loading: boolean;
  error?: string;
  loadConversation: (id: string) => Promise<ConversationRecord>;
  refreshConversations: () => void;
  deleteConversation: (id: string) => Promise<void>;
  deleteConversations: (ids: string[]) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  addOptimisticConversation: (item: ConversationListItem) => void;
}

const CONVERSATIONS_QUERY_KEY = ['ai-chat', 'conversations'];

export function useConversations(
  conversationApi: ConversationApi,
): UseConversationsReturn {
  const queryClient = useQueryClient();

  const {
    data: conversations = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: async () => {
      const response = await conversationApi.getConversations();
      return response.conversations;
    },
  });

  const loadConversation = useCallback(
    async (id: string): Promise<ConversationRecord> => {
      return conversationApi.getConversationById(id);
    },
    [conversationApi],
  );

  const refreshConversations = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
  }, [queryClient]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => conversationApi.deleteConversation(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
      const previous = queryClient.getQueryData<ConversationListItem[]>(
        CONVERSATIONS_QUERY_KEY,
      );
      queryClient.setQueryData<ConversationListItem[]>(
        CONVERSATIONS_QUERY_KEY,
        old => old?.filter(c => c.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => conversationApi.deleteConversations(ids),
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
      const previous = queryClient.getQueryData<ConversationListItem[]>(
        CONVERSATIONS_QUERY_KEY,
      );
      const idSet = new Set(ids);
      queryClient.setQueryData<ConversationListItem[]>(
        CONVERSATIONS_QUERY_KEY,
        old => old?.filter(c => !idSet.has(c.id)),
      );
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    },
  });

  const starMutation = useMutation({
    mutationFn: (id: string) => conversationApi.toggleConversationStar(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
      const previous = queryClient.getQueryData<ConversationListItem[]>(
        CONVERSATIONS_QUERY_KEY,
      );
      queryClient.setQueryData<ConversationListItem[]>(
        CONVERSATIONS_QUERY_KEY,
        old =>
          old?.map(c => (c.id === id ? { ...c, isStarred: !c.isStarred } : c)),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    },
  });

  const deleteConversation = useCallback(
    async (id: string): Promise<void> => {
      await deleteMutation.mutateAsync(id);
    },
    [deleteMutation],
  );

  const deleteConversations = useCallback(
    async (ids: string[]): Promise<void> => {
      await bulkDeleteMutation.mutateAsync(ids);
    },
    [bulkDeleteMutation],
  );

  const toggleStar = useCallback(
    async (id: string): Promise<void> => {
      await starMutation.mutateAsync(id);
    },
    [starMutation],
  );

  const addOptimisticConversation = useCallback(
    (item: ConversationListItem) => {
      queryClient.setQueryData<ConversationListItem[]>(
        CONVERSATIONS_QUERY_KEY,
        old => {
          if (old?.some(c => c.id === item.id)) return old;
          return [item, ...(old ?? [])];
        },
      );
    },
    [queryClient],
  );

  const sortedConversations = useMemo(
    () =>
      [...conversations].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [conversations],
  );

  return {
    conversations: sortedConversations,
    loading: isLoading,
    error: error?.message,
    loadConversation,
    refreshConversations,
    deleteConversation,
    deleteConversations,
    toggleStar,
    addOptimisticConversation,
  };
}
