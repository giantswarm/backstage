import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Text,
} from '@backstage/ui';
import { useRef } from 'react';

interface DeleteConversationsDialogProps {
  count: number | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConversationsDialog = ({
  count,
  onConfirm,
  onCancel,
}: DeleteConversationsDialogProps) => {
  // Preserve the last count so it doesn't flicker to 0 during the dialog's
  // close animation, when `count` has already been cleared.
  const lastCountRef = useRef(0);
  if (count !== null) {
    lastCountRef.current = count;
  }
  const displayCount = lastCountRef.current;

  return (
    <Dialog
      isOpen={count !== null}
      onOpenChange={open => {
        if (!open) onCancel();
      }}
    >
      <DialogHeader>Delete {displayCount} conversations?</DialogHeader>
      <DialogBody>
        <Text>
          {displayCount} conversations will be permanently deleted. This action
          cannot be undone.
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
