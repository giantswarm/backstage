import { useState } from 'react';
import { Button, ButtonGroup } from '@material-ui/core';
import { InventoryRecord } from '../../apis';
import {
  AlignDialog,
  EditDialog,
  isDeclared,
  LifecycleDialog,
  RowDialogProps,
  TransferDialog,
} from './dialogs';

type Action = 'edit' | 'transfer' | 'deprecate' | 'archive' | 'align';

/**
 * The actions of one repository's row, each one tool call as the signed-in
 * person: Edit, Transfer, Deprecate and Archive (team-file pull requests)
 * and Align now (the set-up workflow dispatched). The team-file writes need
 * a declaration; an undeclared repository offers Align now (with the team).
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
  const declared = isDeclared(record);
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
          onClick={() => setOpen('edit')}
        >
          Edit
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
        <Button onClick={() => setOpen('align')}>Align now</Button>
      </ButtonGroup>
      {open === 'edit' && isDeclared(record) && (
        <EditDialog {...dialog} record={record} />
      )}
      {open === 'transfer' && <TransferDialog {...dialog} />}
      {open === 'deprecate' && (
        <LifecycleDialog lifecycle="deprecated" {...dialog} />
      )}
      {open === 'archive' && (
        <LifecycleDialog lifecycle="archived" {...dialog} />
      )}
      {open === 'align' && <AlignDialog {...dialog} />}
    </div>
  );
}
