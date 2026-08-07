import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
  TextField,
} from '@backstage/ui';

/**
 * Longest name this dialog will submit.
 *
 * Not a kagent limit — its `session.name` column is unbounded `TEXT` — but ours,
 * matching the conversation titles in the ai-chat plugin. The backend enforces
 * the same bound, because a `maxLength` on an input is a courtesy and not a
 * guard.
 *
 * Must match SESSION_NAME_MAX_LENGTH in plugins/agent-platform-backend.
 */
export const SESSION_NAME_MAX_LENGTH = 255;

export type SessionRenameDialogProps = {
  /** The session's current title, used to seed the field each time it opens. */
  title: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isRenaming: boolean;
  error?: string;
  /** Receives the trimmed name. Failure is reported through `error`. */
  onConfirm: (name: string) => void;
  /**
   * From the `/me` probe. `false` means this kagent runs without per-user session
   * scoping, so the session may not be the reader's own — the same caveat the
   * delete dialog carries, for the same reason. `undefined` claims nothing.
   */
  isUserScoped?: boolean;
};

/**
 * Renames a session.
 *
 * Deliberately not built on `ConfirmDialog`: this asks for a value rather than
 * for a yes, so it needs a `<form>` — which is what makes Enter submit — and a
 * submit button that stays disabled until the field holds something usable.
 *
 * It does keep that component's two conventions, both of which matter here.
 * Confirming does **not** close it: the rename can fail, and a dialog that
 * dismissed itself on submit would have thrown away the only place left to say
 * so. And while the request is in flight the dialog cannot be dismissed, so a
 * stray click outside cannot orphan a write already on its way to kagent.
 *
 * The field is re-seeded from `title` whenever the dialog opens, so a cancelled
 * edit does not linger into the next attempt.
 */
export function SessionRenameDialog({
  title,
  isOpen,
  onOpenChange,
  isRenaming,
  error,
  onConfirm,
  isUserScoped,
}: SessionRenameDialogProps) {
  const [value, setValue] = useState(title);

  // Seeded on the closed → open transition only, never on a `title` change.
  //
  // `title` is live data: the session read polls, so it moves under an open
  // dialog whenever the session is renamed elsewhere — kagent's own UI, another
  // tab, another device. Depending on it here would replace whatever the user
  // has typed, mid-sentence and with no indication anything happened.
  const wasOpen = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setValue(title);
    }
    wasOpen.current = isOpen;
  }, [isOpen, title]);

  const trimmed = value.trim();
  const isValid =
    trimmed.length > 0 && trimmed.length <= SESSION_NAME_MAX_LENGTH;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isValid && !isRenaming) {
      onConfirm(trimmed);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      // Gated here rather than only through `isDismissable` /
      // `isKeyboardDismissDisabled`, which reach the outside click and Escape but
      // not `DialogHeader`'s own close button — bui renders that unconditionally,
      // and it routes through this callback. Without the gate, closing mid-flight
      // leaves the mutation running with nowhere to report a failure, and the user
      // looking at the old title believing the rename worked.
      onOpenChange={next => {
        if (!isRenaming) {
          onOpenChange(next);
        }
      }}
      isDismissable={!isRenaming}
      isKeyboardDismissDisabled={isRenaming}
      width="min(90vw, 520px)"
    >
      <form onSubmit={handleSubmit}>
        <DialogHeader>Rename session</DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="3">
            <TextField
              label="Session name"
              value={value}
              onChange={setValue}
              maxLength={SESSION_NAME_MAX_LENGTH}
              // The rule guards against stealing focus on page load. This is a
              // modal the user just opened in order to type a name, and react-aria
              // focuses the dialog container rather than the field — so without
              // this the cursor is nowhere and the field has to be clicked first.
              // Focusing the first meaningful control is what the ARIA dialog
              // pattern asks for. Pinned by a test.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            {isUserScoped === false && (
              <Text variant="body-medium">
                This kagent deployment does not scope sessions to individual
                users, so this session may have been started by somebody else.
              </Text>
            )}
            {error ? <Alert status="danger" description={error} /> : null}
          </Flex>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            isDisabled={isRenaming}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            isDisabled={!isValid}
            isPending={isRenaming}
          >
            {isRenaming ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
