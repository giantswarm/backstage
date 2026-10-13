import { useCallback, useState } from 'react';
import { Button, Dialog, DialogBody, DialogHeader } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { useQueryClient } from '@tanstack/react-query';
import {
  DisabledAction,
  PHONE_FULL_SCREEN_DIALOG,
  dialogDismissLock,
} from '@giantswarm/backstage-plugin-ui-react';
import { ToolDetailPanel } from '../ToolDetail';

const NO_SESSION_REASON = 'Running it needs a muster session.';

/** The page's reads that a new run changes: the flow's last run and the statistics. */
const RUN_QUERY_KINDS = [
  'workflow-latest-run',
  'workflow-run-count',
  'workflow-stats',
];

const useStyles = makeStyles({
  dialog: PHONE_FULL_SCREEN_DIALOG,
});

export type WorkflowRunActionProps = {
  name: string;
  toolName: string;
  installation?: string;
  hasSession: boolean;
};

/**
 * The workflow page's "Run now": its `workflow_<name>` tool's argument form in
 * a dialog, run as the signed-in person. The dialog stays open while a run is
 * on its way, and a settled run refreshes the page's last run and statistics.
 */
export function WorkflowRunAction({
  name,
  toolName,
  installation,
  hasSession,
}: WorkflowRunActionProps) {
  const classes = useStyles();
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [isRunning, setRunning] = useState(false);

  const onPendingChange = useCallback(
    (pending: boolean) => {
      setRunning(pending);
      if (!pending) {
        for (const kind of RUN_QUERY_KINDS) {
          queryClient.invalidateQueries({
            queryKey: ['muster', kind, installation, name],
          });
        }
      }
    },
    [queryClient, installation, name],
  );

  if (!hasSession) {
    return (
      <DisabledAction reason={NO_SESSION_REASON}>
        {describedBy => (
          <Button variant="secondary" isDisabled aria-describedby={describedBy}>
            Run now
          </Button>
        )}
      </DisabledAction>
    );
  }

  return (
    <>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Run now
      </Button>
      <Dialog
        isOpen={isOpen}
        {...dialogDismissLock(isRunning, setOpen)}
        width="min(90vw, 640px)"
        className={classes.dialog}
      >
        <DialogHeader>Run {name}</DialogHeader>
        <DialogBody>
          <ToolDetailPanel
            name={toolName}
            installation={installation}
            showMarkers={false}
            runLabel="Run"
            note="Runs as you, with your sign-ins."
            onPendingChange={onPendingChange}
          />
        </DialogBody>
      </Dialog>
    </>
  );
}
