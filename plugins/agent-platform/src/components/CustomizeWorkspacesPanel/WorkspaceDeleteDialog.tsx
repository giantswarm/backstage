import { Flex, Text } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import { useWorkspaceDetail } from '../../hooks/useWorkspaceActions';
import { sessionsNoun, type WorkspaceRow } from '../../lib/workspaceList';

export type WorkspaceDeleteDialogProps = {
  row: WorkspaceRow;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isDeleting: boolean;
  error?: string;
  onConfirm: () => void;
};

/**
 * What deleting takes away, and what stays: the Sessions with a directory on
 * the volume keep it until each is cleaned up, so the volume goes only after
 * the last one. Names them from `get_workspace`, read when the dialog opens.
 */
function SessionsStillUsing({ row, isOpen }: { row: WorkspaceRow; isOpen: boolean }) {
  const detail = useWorkspaceDetail(row.installation, row.name, isOpen);
  if (detail.isPending && detail.fetchStatus !== 'idle') {
    return (
      <Text variant="body-medium" color="secondary">
        Checking which Sessions still use it…
      </Text>
    );
  }
  const directories = detail.data?.sessionDirectories;
  if (!directories) {
    // Unread: the list's count is all there is to say.
    return row.sessions > 0 ? (
      <Text variant="body-medium">
        {sessionsNoun(row.sessions)} still use it; each keeps its directory
        until it is cleaned up, then the volume goes.
      </Text>
    ) : (
      <Text variant="body-medium">Its volume goes with it.</Text>
    );
  }
  if (directories.length === 0) {
    return <Text variant="body-medium">No Session uses it: its volume goes with it.</Text>;
  }
  return (
    <Flex direction="column" gap="2">
      <Text variant="body-medium">
        {sessionsNoun(directories.length)} still{' '}
        {directories.length === 1 ? 'uses' : 'use'} it; each keeps its
        directory until it is cleaned up, then the volume goes:
      </Text>
      <ul style={{ margin: 0, paddingLeft: 'var(--bui-space-5)' }}>
        {directories.map(directory => (
          <li key={directory.session}>
            <Text variant="body-medium">
              {directory.name || directory.session}
            </Text>
          </li>
        ))}
      </ul>
    </Flex>
  );
}

/** Asks before deleting a workspace, naming it and the Sessions still using it. */
export function WorkspaceDeleteDialog({
  row,
  isOpen,
  onOpenChange,
  isDeleting,
  error,
  onConfirm,
}: WorkspaceDeleteDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete ${row.name}?`}
      destructive
      confirmLabel="Delete workspace"
      busyLabel="Deleting…"
      isBusy={isDeleting}
      error={error}
      onConfirm={onConfirm}
    >
      <Flex direction="column" gap="3">
        <Text variant="body-medium">
          Its sync stops and no new Session can start on it.
        </Text>
        <SessionsStillUsing row={row} isOpen={isOpen} />
      </Flex>
    </ConfirmDialog>
  );
}
