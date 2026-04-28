import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Text,
} from '@backstage/ui';
import { useRef } from 'react';
import type { ConversationListItem } from '../../api';

interface DeleteConversationDialogProps {
  conversation: ConversationListItem | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConversationDialog = ({
  conversation,
  onConfirm,
  onCancel,
}: DeleteConversationDialogProps) => {
  // Preserve the last title so it doesn't flicker to the fallback during the
  // dialog's close animation, when `conversation` has already been cleared.
  const lastTitleRef = useRef('');
  if (conversation) {
    lastTitleRef.current =
      conversation.title || conversation.preview || 'Untitled conversation';
  }
  const title = lastTitleRef.current;

  return (
    <Dialog
      isOpen={conversation !== null}
      onOpenChange={open => {
        if (!open) onCancel();
      }}
    >
      <DialogHeader>Delete conversation?</DialogHeader>
      <DialogBody>
        <Text>
          "{title}" will be permanently deleted. This action cannot be undone.
        </Text>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" slot="close">
          Cancel
        </Button>
        <Button variant="primary" destructive onClick={onConfirm}>
          Delete
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
