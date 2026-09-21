import { useState } from 'react';
import { Button, ButtonGroup, makeStyles } from '@material-ui/core';
import { InventoryRecord } from '../../apis';
import {
  AlignDialog,
  EditDialog,
  isDeclared,
  LifecycleDialog,
  RowDialogProps,
  TransferDialog,
} from './dialogs';

type Action =
  'edit' | 'transfer' | 'deprecate' | 'archive' | 'delete' | 'align';

/**
 * Delete stands apart from the group, in the theme's error colour: the one
 * action after which the repository is gone.
 */
const useStyles = makeStyles(theme => ({
  delete: {
    marginLeft: theme.spacing(1),
    color: theme.palette.error.main,
    borderColor: theme.palette.error.main,
    '&:hover': {
      color: theme.palette.error.contrastText,
      backgroundColor: theme.palette.error.main,
      borderColor: theme.palette.error.main,
    },
    '&.Mui-disabled': {
      color: theme.palette.action.disabled,
      borderColor: theme.palette.action.disabledBackground,
    },
  },
}));

/**
 * The actions of one repository's row, each one tool call as the signed-in
 * person: Edit, Transfer, Deprecate and Archive (team-file pull requests),
 * Align now (the set-up workflow dispatched) and, apart from the group and in
 * red, Delete (a team-file pull request too: the reconciler deletes the
 * repository once the team has approved). The team-file writes need a
 * declaration; an undeclared repository offers Align now (with the team).
 */
export function RowActions({
  record,
  onChanged,
}: {
  record: InventoryRecord;
  /** A write landed and its dialog was closed: the record and the listing are re-read. */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<Action>();
  // A write landed while its dialog is open. The re-read waits for the
  // dialog's Close: a re-read listing re-renders the table's rows, which
  // re-mounts this panel and would take the dialog -- and the result it
  // shows -- with it.
  const [landed, setLanded] = useState(false);
  const classes = useStyles();
  const declared = isDeclared(record);
  const close = () => {
    setOpen(undefined);
    if (landed) {
      setLanded(false);
      onChanged();
    }
  };
  const dialog: RowDialogProps = {
    record,
    isOpen: true,
    onClose: close,
    onDone: () => setLanded(true),
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
      <Button
        size="small"
        variant="outlined"
        className={classes.delete}
        disabled={!declared}
        title={undeclaredTitle}
        onClick={() => setOpen('delete')}
      >
        Delete
      </Button>
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
      {open === 'delete' && <LifecycleDialog lifecycle="deleted" {...dialog} />}
      {open === 'align' && <AlignDialog {...dialog} />}
    </div>
  );
}
