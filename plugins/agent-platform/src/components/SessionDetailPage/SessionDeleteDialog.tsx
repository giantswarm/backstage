import { useEffect, useState } from 'react';
import { Text } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';
import { RuntimeLoss } from '@giantswarm/backstage-plugin-agent-platform-common';

/**
 * Why a delete failed, for the person who pressed it.
 *
 * On a session whose runtime is lost the backend's message is a riddle: kagent
 * answers `Unavailable: Failed to delete AgentInstance`, because its delete
 * suspends the instance's runtime before removing it and that suspend dials a
 * node that no longer exists. Nothing the person did, nothing they can do from
 * here — so the words say what fixes it. Once kagent skips the suspend for an
 * instance it has marked lost, the delete goes through and this is not
 * reached; before that, the reported loss and the suspected one word the
 * failure the same way, since the cause is the same. Every other failure keeps
 * the backend's message.
 */
export function describeSessionDeleteFailure(
  error: Error,
  loss: RuntimeLoss | undefined,
): string {
  // Sends that kept timing out say nothing about the runtime's node: the
  // backend's message stands.
  if (!loss || loss.source === 'send-timeouts') {
    return error.message;
  }
  return `kagent could not delete this session: it suspends the runtime first, and this runtime was lost with its platform node. A kagent fix is coming; until then the session stays listed. Nothing else is affected. (${error.message})`;
}

/**
 * How long a delete runs before the dialog says what it is waiting for. Right
 * after a turn ends kagent refuses the delete until the turn has settled, and
 * the backend retries it for up to about 16 s; an ordinary delete answers well
 * within this.
 */
export const SESSION_DELETE_SETTLING_HINT_MS = 2_000;

/** Whether `isBusy` has been true for `afterMs` without a break. */
function useBusyFor(isBusy: boolean, afterMs: number): boolean {
  const [isLong, setLong] = useState(false);
  useEffect(() => {
    setLong(false);
    if (!isBusy) {
      return undefined;
    }
    const timer = setTimeout(() => setLong(true), afterMs);
    return () => clearTimeout(timer);
  }, [isBusy, afterMs]);
  return isBusy && isLong;
}

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
 * soft-deletes — it shuts the runtime down and marks the session `DELETED`, but
 * the row, its tasks and its events stay in the controller's database (checked on
 * kagent 1.5.0, T62) — while every read answers 404 for it — so for anyone using
 * Backstage it is gone, and nothing in this UI can bring it back. Saying only
 * "permanently deleted" would be wrong about the retention; saying only "hidden"
 * would imply an undo that does not exist.
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
  const isSettling = useBusyFor(isDeleting, SESSION_DELETE_SETTLING_HINT_MS);
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
        The runtime shuts down, and the session can no longer be listed or
        opened. kagent keeps it in its database, but it cannot be restored from
        here.
      </Text>
      {isUserScoped === false && (
        <Text variant="body-medium">
          This kagent does not scope sessions to users, so someone else may have
          started this session.
        </Text>
      )}
      {isSettling && (
        <div role="status">
          <Text variant="body-medium">
            Waiting for the session's last turn to settle; the delete goes
            through as soon as kagent allows it.
          </Text>
        </div>
      )}
    </ConfirmDialog>
  );
}
