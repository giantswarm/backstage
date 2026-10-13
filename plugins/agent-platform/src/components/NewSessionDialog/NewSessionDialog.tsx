import { Dialog, DialogBody, DialogHeader } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import {
  dialogDismissLock,
  PHONE_FULL_SCREEN_DIALOG,
} from '@giantswarm/backstage-plugin-ui-react';
import type { AgentRow } from '../AgentsDataProvider';
import { NewSessionComposer } from '../NewSessionComposer';

const useStyles = makeStyles({
  // The whole screen on a phone, so the box and Start stay above the soft
  // keyboard (T22 C4).
  dialog: PHONE_FULL_SCREEN_DIALOG,
});

export type NewSessionDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  agents: AgentRow[];
  isLoadingAgents?: boolean;
  defaultAgent?: AgentRow;
  isStarting: boolean;
  error?: string;
  onStart: (agent: AgentRow, prompt: string) => void;
};

/**
 * The composer in a modal, for the places a permanently visible one would not
 * belong — today the agent detail page, where starting a session is one action
 * among several rather than the point of the screen.
 *
 * Deliberately thin: everything about composing lives in
 * {@link NewSessionComposer}, including its own `<form>` and Start button, so
 * there is no `DialogFooter` here. A footer would mean two submit buttons for one
 * form.
 *
 * Two conventions borrowed from `SessionRenameDialog`, both load-bearing. It does
 * **not** close on submit — the create can fail, and this is the only place left
 * to say so, as well as the only place the prompt still exists. And it cannot be
 * dismissed while a create is in flight, so a stray click outside cannot orphan a
 * write already on its way to kagent. The caller closes it by navigating away.
 *
 * At phone width it is the whole screen, as the command palette is: a centred
 * card would leave the box and its Start button under the soft keyboard.
 */
export function NewSessionDialog({
  isOpen,
  onOpenChange,
  isStarting,
  ...composerProps
}: NewSessionDialogProps) {
  const classes = useStyles();
  return (
    <Dialog
      isOpen={isOpen}
      {...dialogDismissLock(isStarting, onOpenChange)}
      width="min(90vw, 560px)"
      className={classes.dialog}
    >
      <DialogHeader>New session</DialogHeader>
      <DialogBody>
        <NewSessionComposer
          {...composerProps}
          isStarting={isStarting}
          // Deliberate here and only here: this is a modal the user opened in
          // order to type, and react-aria focuses the dialog container rather
          // than the field. See the composer, which carries the full reasoning.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
      </DialogBody>
    </Dialog>
  );
}
