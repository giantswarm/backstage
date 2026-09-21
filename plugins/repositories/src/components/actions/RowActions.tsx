import { useState } from 'react';
import { Button, ButtonGroup, makeStyles } from '@material-ui/core';
import { Text } from '@backstage/ui';
import { InventoryRecord } from '../../apis';
import {
  AdoptDialog,
  AlignDialog,
  EditDialog,
  isDeclared,
  LifecycleDialog,
  RowDialogProps,
  TransferDialog,
} from './dialogs';

type Action =
  'edit' | 'adopt' | 'transfer' | 'deprecate' | 'archive' | 'delete' | 'align';

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
  },
  note: {
    marginTop: theme.spacing(1),
  },
}));

/**
 * The actions of one repository's row, each one tool call as the signed-in
 * person. A declared repository: Edit, Transfer, Deprecate and Archive
 * (team-file pull requests on its entry), Align now (the set-up workflow
 * dispatched) and, apart from the group and in red, Delete (a team-file pull
 * request too: the reconciler deletes the repository once the team has
 * approved). An undeclared repository -- on GitHub, in no team file, the
 * Unassigned scope -- has no entry to edit, move or delete: it offers Adopt
 * (the entry added to a team's file), Deprecate and Archive (the one pull
 * request declares it and ends its life) and Align now (a check from a
 * team), and a line says so.
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

  return (
    <div data-testid="row-actions">
      <ButtonGroup size="small" variant="outlined" aria-label="Actions">
        {declared ? (
          <Button onClick={() => setOpen('edit')}>Edit</Button>
        ) : (
          <Button onClick={() => setOpen('adopt')}>Adopt</Button>
        )}
        {declared && (
          <Button onClick={() => setOpen('transfer')}>Transfer</Button>
        )}
        <Button onClick={() => setOpen('deprecate')}>Deprecate</Button>
        <Button onClick={() => setOpen('archive')}>Archive</Button>
        <Button onClick={() => setOpen('align')}>Align now</Button>
      </ButtonGroup>
      {declared && (
        <Button
          size="small"
          variant="outlined"
          className={classes.delete}
          onClick={() => setOpen('delete')}
        >
          Delete
        </Button>
      )}
      {!declared && (
        <div className={classes.note} data-testid="undeclared-note">
          <Text variant="body-small" color="secondary">
            No team file declares {record.repository}. Adopt declares it for a
            team; Deprecate and Archive declare it and end its life in the one
            pull request.
          </Text>
        </div>
      )}
      {open === 'edit' && isDeclared(record) && (
        <EditDialog {...dialog} record={record} />
      )}
      {open === 'adopt' && <AdoptDialog {...dialog} />}
      {open === 'transfer' && <TransferDialog {...dialog} />}
      {open === 'deprecate' &&
        (declared ? (
          <LifecycleDialog lifecycle="deprecated" {...dialog} />
        ) : (
          <AdoptDialog lifecycle="deprecated" {...dialog} />
        ))}
      {open === 'archive' &&
        (declared ? (
          <LifecycleDialog lifecycle="archived" {...dialog} />
        ) : (
          <AdoptDialog lifecycle="archived" {...dialog} />
        ))}
      {open === 'delete' && <LifecycleDialog lifecycle="deleted" {...dialog} />}
      {open === 'align' && <AlignDialog {...dialog} />}
    </div>
  );
}
