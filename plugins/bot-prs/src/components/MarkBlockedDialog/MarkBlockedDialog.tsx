import { useEffect, useState } from 'react';
import { Alert, Text, TextField } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import { useMargeMark } from '../../hooks/useMarge';
import {
  MARGE_MARK_TOOL,
  MargeNotConnectedError,
  type BotPrRow,
} from '../../lib/marge';
import { ConnectMargeAlert } from '../ConnectMargeAlert';

export type MarkBlockedDialogProps = {
  installation: string;
  row: BotPrRow | undefined;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onApplied?: () => void;
};

/**
 * `x_marge_mark` with `outcome: blocked`: a machine-readable marker comment
 * on the PR, written as the person, that tells the next sweeps and any rescue
 * that a person looked and the PR waits on something outside the code. The
 * marker goes stale on its own when the PR content changes.
 */
export function MarkBlockedDialog({
  installation,
  row,
  isOpen,
  onOpenChange,
  onApplied,
}: MarkBlockedDialogProps) {
  const mark = useMargeMark(installation);
  const [reason, setReason] = useState('');
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setApplied(false);
      mark.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, row?.ref]);

  const notConnected = mark.error instanceof MargeNotConnectedError;

  const onConfirm = async () => {
    if (!row) {
      return;
    }
    try {
      await mark.run({
        pr_url: row.ref,
        outcome: 'blocked',
        reason: reason.trim(),
        tool: MARGE_MARK_TOOL,
      });
      setApplied(true);
      onApplied?.();
    } catch {
      // Shown by the dialog through `mark.error`.
    }
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={row ? `Mark ${row.ref} blocked` : 'Mark blocked'}
      confirmLabel="Mark blocked"
      busyLabel="Writing…"
      isBusy={mark.isPending}
      isDone={applied}
      isConfirmDisabled={reason.trim() === '' || notConnected}
      error={mark.error && !notConnected ? mark.error.message : undefined}
      onConfirm={onConfirm}
    >
      {notConnected && mark.error ? (
        <ConnectMargeAlert
          installation={installation}
          message={mark.error.message}
        />
      ) : null}
      {applied && mark.result ? (
        <Alert
          status="success"
          title="Marked blocked"
          description={`The marker is on the PR as you, for head ${mark.result.head_sha.slice(
            0,
            7,
          )}${
            mark.result.change_id ? `, change ${mark.result.change_id}` : ''
          }. It goes stale on its own when the PR content changes.`}
        />
      ) : (
        <>
          <Text variant="body-small" color="secondary">
            Posts a marker comment on the PR as you. The next sweeps and any
            rescue see that a person looked and the PR waits on something the
            code cannot fix. Say what it waits on.
          </Text>
          <TextField
            aria-label="Reason"
            label="Reason"
            isRequired
            value={reason}
            onChange={setReason}
            placeholder="e.g. waits on the upstream release that fixes the failing check"
          />
        </>
      )}
    </ConfirmDialog>
  );
}
