import { useState } from 'react';
import { Button, ButtonGroup } from '@material-ui/core';
import { InventoryRecord } from '../../apis';
import {
  ConfigureDialog,
  LifecycleDialog,
  ReconcileDialog,
  RowDialogProps,
  TransferDialog,
} from './dialogs';

type Action = 'configure' | 'transfer' | 'deprecate' | 'archive' | 'reconcile';

/**
 * The actions of one repository's row, each one tool call as the signed-in
 * person: Configure, Transfer, Deprecate and Archive (team-file pull
 * requests) and Reconcile now (a workflow dispatch). The team-file writes
 * need a declaration; an undeclared repository offers Reconcile now (with
 * the team).
 */
export function RowActions({
  record,
  onChanged,
}: {
  record: InventoryRecord;
  /** A write landed: the record and the listing are re-read. */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<Action>();
  const declared = record.declaration !== null;
  const dialog: RowDialogProps = {
    record,
    isOpen: true,
    onClose: () => setOpen(undefined),
    onDone: onChanged,
  };
  const undeclaredTitle = declared
    ? undefined
    : 'Needs a declaration in a team file';

  return (
    <div data-testid="row-actions">
      <ButtonGroup size="small" variant="outlined" aria-label="Actions">
        <Button
          disabled={!declared}
          title={undeclaredTitle}
          onClick={() => setOpen('configure')}
        >
          Configure
        </Button>
        <Button
          disabled={!declared}
          title={undeclaredTitle}
          onClick={() => setOpen('transfer')}
        >
          Transfer
        </Button>
        <Button
          disabled={!declared}
          title={undeclaredTitle}
          onClick={() => setOpen('deprecate')}
        >
          Deprecate
        </Button>
        <Button
          disabled={!declared}
          title={undeclaredTitle}
          onClick={() => setOpen('archive')}
        >
          Archive
        </Button>
        <Button onClick={() => setOpen('reconcile')}>Reconcile now</Button>
      </ButtonGroup>
      {open === 'configure' && <ConfigureDialog {...dialog} />}
      {open === 'transfer' && <TransferDialog {...dialog} />}
      {open === 'deprecate' && (
        <LifecycleDialog lifecycle="deprecated" {...dialog} />
      )}
      {open === 'archive' && (
        <LifecycleDialog lifecycle="archived" {...dialog} />
      )}
      {open === 'reconcile' && <ReconcileDialog {...dialog} />}
    </div>
  );
}
