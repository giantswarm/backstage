import type { ConversationListItem } from '../api';

export function getConversationTitle(
  conversation:
    | Pick<ConversationListItem, 'title' | 'preview'>
    | null
    | undefined,
): string {
  return (
    conversation?.title || conversation?.preview || 'Untitled conversation'
  );
}
