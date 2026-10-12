import { Text, VisuallyHidden } from '@backstage/ui';
import KeyboardReturnIcon from '@material-ui/icons/KeyboardReturn';
import { sendKeyCaption } from '../../lib/sendKey';
import { Kbd } from '../Kbd';

export type SendKeyHintProps = {
  /** Whether the person types on a soft keyboard (`useTouchInput`). */
  touch: boolean;
};

/** Enter as a key cap: the Return icon, named for screen readers. */
function EnterKey() {
  return (
    <Kbd>
      <KeyboardReturnIcon aria-hidden />
      <VisuallyHidden>Enter</VisuallyHidden>
    </Kbd>
  );
}

/**
 * The hint under a message box that says how it sends — {@link sendKeyCaption}
 * drawn with key caps. Its text reads the same as the caption the other
 * composers show ("Enter sends, Shift+Enter for a new line."), with Enter drawn
 * as the Return icon. On touch input it is the caption's tap wording, since
 * Enter breaks the line there as on any phone.
 */
export function SendKeyHint({ touch }: SendKeyHintProps) {
  return (
    <Text variant="body-small" color="secondary" data-testid="send-key-hint">
      {touch ? (
        sendKeyCaption({}, true)
      ) : (
        <>
          <EnterKey /> sends, <Kbd>Shift</Kbd>+<EnterKey /> for a new line.
        </>
      )}
    </Text>
  );
}
