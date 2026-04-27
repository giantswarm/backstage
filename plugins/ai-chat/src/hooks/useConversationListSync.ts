import { useEffect, useRef } from 'react';
import { useAssistantState } from '@assistant-ui/react';
import { ConversationApi, ConversationListItem } from '../api';
import { useConversations } from './useConversations';
import { useChatRuntimeContext } from './ChatRuntimeContext';

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
export const useConversationListSync = (conversationApi: ConversationApi) => {
  const { getConversationId, isNewConversation } = useChatRuntimeContext();
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

  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      refreshConversations();
    }
    wasRunningRef.current = isRunning;
  }, [isRunning, refreshConversations]);
};
