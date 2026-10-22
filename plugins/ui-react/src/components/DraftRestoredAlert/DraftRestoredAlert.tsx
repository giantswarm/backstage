import { useState } from 'react';
import { Alert, Button, ButtonIcon, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import CloseIcon from '@material-ui/icons/Close';
import { ConfirmDialog } from '../ConfirmDialog';

const useStyles = makeStyles({
  // The close button level with the title, like the shell's other closable
  // alerts, rather than centred on the card.
  alert: {
    '& .bui-AlertActions': {
      alignItems: 'flex-start',
      marginTop: 'calc(-1 * var(--bui-space-1))',
      marginRight: 'calc(-1 * var(--bui-space-1))',
    },
  },
});

export type DraftRestoredAlertProps = {
  /**
   * What is kept and until when, as a sentence: "It is kept in this browser
   * tab until you create the agent or discard it."
   */
  keptUntil: string;
  /** Clears the draft and the form: the confirmed "Start over". */
  onStartOver: () => void;
  /** Hides the alert and keeps the draft. */
  onDismiss: () => void;
};

/**
 * Says that a form came back with the draft `useSessionDraft` kept, and
 * offers to start fresh instead. Starting over asks first: the draft may be
 * a long form's worth of input. "Start over" sits under the text rather than
 * beside the close button, so the alert keeps its width at phone size.
 */
export function DraftRestoredAlert({
  keptUntil,
  onStartOver,
  onDismiss,
}: DraftRestoredAlertProps) {
  const classes = useStyles();
  const [isConfirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Alert
        status="info"
        className={classes.alert}
        title="Your draft is back"
        description={
          <Flex direction="column" gap="2" align="start">
            <span>What you entered before is filled in again. {keptUntil}</span>
            <Button
              size="small"
              variant="secondary"
              onPress={() => setConfirmOpen(true)}
            >
              Start over
            </Button>
          </Flex>
        }
        customActions={
          <ButtonIcon
            variant="tertiary"
            size="small"
            icon={<CloseIcon fontSize="small" />}
            // Not just "Close": the wizard frame's own Close leaves the form.
            aria-label="Close draft note"
            onPress={onDismiss}
          />
        }
      />
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onOpenChange={setConfirmOpen}
        title="Start over?"
        confirmLabel="Discard draft"
        cancelLabel="Keep draft"
        onConfirm={() => {
          setConfirmOpen(false);
          onStartOver();
        }}
      >
        <Text variant="body-medium">
          Everything you entered is cleared and the form starts empty.
        </Text>
      </ConfirmDialog>
    </>
  );
}
