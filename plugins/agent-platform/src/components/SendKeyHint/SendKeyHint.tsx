import { Fragment } from 'react';
import { sendKeyCaption, type SendKeyCaptionOptions } from '../../lib/sendKey';
import { EnterKey, Kbd } from '../Kbd';

export type SendKeyHintProps = {
  /** What Enter and the button do: {@link sendKeyCaption}'s overrides. A
   * prop of its own because `key` is React's. */
  options?: SendKeyCaptionOptions;
  /** Whether the person types on a soft keyboard (`useTouchInput`). */
  touch: boolean;
};

/** The keys a send-key caption names, as they appear in its words. */
const KEY_NAMES = /\b(Shift\+Enter|Enter)\b/;

/**
 * How a message box sends: {@link sendKeyCaption}'s words, with the keys they
 * name drawn as key caps — Enter as the Return icon. The words come from the
 * caption itself, so every box says the same thing whether it draws keys or
 * not. On touch input the caption names a button, not a key, and is plain
 * text.
 *
 * Inline content, for the caller's caption `Text`.
 */
export function SendKeyHint({ options, touch }: SendKeyHintProps) {
  // `split` with a capture group keeps the key names at the odd indexes.
  const parts = sendKeyCaption(options, touch).split(KEY_NAMES);
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 0) {
          return part;
        }
        return part === 'Enter' ? (
          <EnterKey key={index} />
        ) : (
          <Fragment key={index}>
            <Kbd>Shift</Kbd>+<EnterKey />
          </Fragment>
        );
      })}
    </>
  );
}
