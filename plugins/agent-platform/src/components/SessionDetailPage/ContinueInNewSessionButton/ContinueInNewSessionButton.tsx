import { Button } from '@backstage/ui';
import { CONTINUE_IN_NEW_SESSION_LABEL } from '../helpers';

/** The new session a notice offers, which the page starts. */
export type NewSessionAction = {
  /** Starts the new session, carrying this conversation on. */
  onStart: () => void;
  /** The new session is being created. */
  isStarting?: boolean;
};

export type ContinueInNewSessionButtonProps = NewSessionAction & {
  /**
   * Primary where it is the only way on; secondary beside a retry the
   * session still takes (a suspected runtime loss).
   */
  variant: 'primary' | 'secondary';
};

/**
 * The way out of a session that cannot go on, inside the notice that says
 * so: the notice is what draws the eye, and the session shows no message box
 * to put a button under once it is over. Under the notice's text rather than
 * in bui `Alert`'s `customActions`, which sit beside the text and would
 * squeeze it at phone width.
 */
export function ContinueInNewSessionButton({
  onStart,
  isStarting,
  variant,
}: ContinueInNewSessionButtonProps) {
  return (
    <span>
      <Button
        size="small"
        variant={variant}
        isPending={isStarting}
        onPress={onStart}
      >
        {CONTINUE_IN_NEW_SESSION_LABEL}
      </Button>
    </span>
  );
}
