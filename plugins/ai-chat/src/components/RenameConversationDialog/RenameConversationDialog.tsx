import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  TextField,
} from '@backstage/ui';
import { FormEvent, useEffect, useState } from 'react';
import type { ConversationListItem } from '../../api';
import { getConversationTitle } from '../../utils';

const TITLE_MAX_LENGTH = 255;

interface RenameConversationDialogProps {
  conversation: ConversationListItem | null;
  onConfirm: (title: string) => void;
  onCancel: () => void;
}

export const RenameConversationDialog = ({
  conversation,
  onConfirm,
  onCancel,
}: RenameConversationDialogProps) => {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (conversation) {
      setValue(getConversationTitle(conversation));
    }
  }, [conversation]);

  const trimmed = value.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= TITLE_MAX_LENGTH;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isValid) {
      onConfirm(trimmed);
    }
  };

  return (
    <Dialog
      isOpen={conversation !== null}
      onOpenChange={open => {
        if (!open) onCancel();
      }}
    >
      <form onSubmit={handleSubmit}>
        <DialogHeader>Rename conversation</DialogHeader>
        <DialogBody>
          <TextField
            label="Title"
            value={value}
            onChange={setValue}
            maxLength={TITLE_MAX_LENGTH}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" slot="close">
            Cancel
          </Button>
          <Button variant="primary" type="submit" isDisabled={!isValid}>
            Save
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
