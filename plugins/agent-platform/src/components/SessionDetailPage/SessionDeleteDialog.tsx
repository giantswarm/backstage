import { Text } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

export type SessionDeleteDialogProps = {
  /** Shown in the title; falls back to the list's placeholder when unnamed. */
  title: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isDeleting: boolean;
  error?: string;
  onConfirm: () => void;
  /**
   * From the `/me` probe. `false` means this kagent runs without per-user session
   * scoping, and the session may not be the reader's own — worth saying before they
   * delete it. `undefined` (probe unresolved or unavailable) says nothing either
   * way, so nothing is claimed.
   */
  isUserScoped?: boolean;
};

/**
 * Asks before deleting a session.
 *
 * Two things, both of them things the reader cannot see for themselves.
 *
 * The first is what "deleted" means here, in both directions at once: kagent
 * soft-deletes, so the record survives on the server, while every read filters it
 * out — so for anyone using Backstage it is gone, and nothing in this UI can bring
 * it back. Saying only "permanently deleted" would be wrong about the retention;
 * saying only "hidden" would imply an undo that does not exist.
 *
 * The second is conditional, and is the reason `isUserScoped` is a prop: on a
 * controller running in `unsecure` mode kagent ignores the forwarded identity and
 * serves one shared user, so the session on screen may be someone else's. The
 * sessions list already carries that caveat about reading; deleting is where it
 * actually costs something. It warns rather than blocks, because kagent authorizes
 * the call either way and the reader is the one who knows whose session this is.
 */
export function SessionDeleteDialog({
  title,
  isOpen,
  onOpenChange,
  isDeleting,
  error,
  onConfirm,
  isUserScoped,
}: SessionDeleteDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete session "${title}"?`}
      destructive
      confirmLabel="Delete session"
      busyLabel="Deleting…"
      isBusy={isDeleting}
      error={error}
      onConfirm={onConfirm}
    >
      <Text variant="body-medium">
        The session and its conversation stop being listed and cannot be opened
        again. kagent keeps the record on its own server, but there is no way to
        restore it from here.
      </Text>
      {isUserScoped === false && (
        <Text variant="body-medium">
          This kagent deployment does not scope sessions to individual users, so
          this session may have been started by somebody else.
        </Text>
      )}
    </ConfirmDialog>
  );
}
