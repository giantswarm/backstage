import type { KeyboardEvent } from 'react';
import { TOUCH_QUERY } from '@giantswarm/backstage-plugin-ui-react';

/**
 * Whether the person types on a touch-first device — no hover, a coarse
 * pointer — and so, as far as a message box can tell, on a soft keyboard.
 * Asked at the moment of the key press or the render, not once: a tablet can
 * gain or lose a pointer. `false` without `matchMedia` (server rendering, a
 * test that does not mock it), which keeps the desktop rule.
 */
export function isTouchInput(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(TOUCH_QUERY).matches
  );
}

/**
 * Whether a key press in a message box means "send".
 *
 * **Enter sends; Shift+Enter inserts a newline.** That is the convention of Slack,
 * Claude, ChatGPT and kagent's own UI, and the first thing people reached for here
 * — the earlier arrangement (Enter for a newline, Cmd/Ctrl+Enter to send) was reported
 * as a bug by the first colleague to try the chat. Multi-line prompts are still
 * routine, which is what Shift+Enter is for. Cmd/Ctrl+Enter keeps sending too: it was
 * the only send key before, and a modifier that does what the bare key does costs
 * nothing.
 *
 * **On touch input, Enter inserts a newline and only the Send button sends**
 * (T22 B2). A soft keyboard has no Shift+Enter, so the desktop rule would leave
 * a phone unable to write a second line — and the phone apps people know
 * (Messages, WhatsApp, Slack's) all break the line on Return. Cmd/Ctrl+Enter
 * still sends there, for a tablet with a hardware keyboard.
 *
 * An Enter that **commits an IME composition** is not a send. Typing Japanese or
 * Chinese, Enter confirms the candidate the user is choosing, and the browser marks
 * that keydown with `isComposing`; treating it as a send would fire the message with
 * the last word missing.
 *
 * Shared by every box in a session that takes typed words — the reply composer, the
 * new-session composer and the answer panel — so the rule is stated once and cannot
 * drift between them. {@link sendKeyCaption} words it for the caption under a box,
 * and `SendKeyHint` draws those words with key caps.
 */
export function isSendKey(
  event: KeyboardEvent,
  touch: boolean = isTouchInput(),
): boolean {
  if (
    event.key !== 'Enter' ||
    event.shiftKey ||
    event.nativeEvent.isComposing
  ) {
    return false;
  }
  return !touch || event.metaKey || event.ctrlKey;
}

/**
 * The `enterKeyHint` for a message box's field: what a soft keyboard labels its
 * Enter key. On touch Enter breaks the line, so the key says so ("return");
 * elsewhere it sends.
 */
export function sendEnterKeyHint(
  touch: boolean = isTouchInput(),
): 'enter' | 'send' {
  return touch ? 'enter' : 'send';
}

/** What a box's send key and Send button do, for {@link sendKeyCaption}. */
export type SendKeyCaptionOptions = {
  /** What Enter does, as a phrase that starts with "Enter". */
  key?: string;
  /** What the button does on touch, as a phrase that starts with "Tap". */
  tap?: string;
};

/**
 * The caption under a message box that says how it sends, following
 * {@link isSendKey}: "Enter sends, Shift+Enter for a new line." with a
 * keyboard, "Tap Send to send." on touch, where Enter breaks the line as on any
 * phone and needs no word.
 *
 * `key` is what Enter does, as a phrase that starts with "Enter" ("Enter
 * starts a session"); `tap` is the same for the button, starting with "Tap"
 * ("Tap Send to start a session"). Both without the full stop.
 */
export function sendKeyCaption(
  { key = 'Enter sends', tap = 'Tap Send to send' }: SendKeyCaptionOptions = {},
  touch: boolean = isTouchInput(),
): string {
  return touch ? `${tap}.` : `${key}, Shift+Enter for a new line.`;
}

/**
 * The boxes' own wording for {@link sendKeyCaption}, beyond the default
 * ("Enter sends"). Kept here, not with each box, so `SendKeyHint`'s test
 * checks every caption in use.
 */
export const SEND_KEY_CAPTIONS = {
  /** The new-session composer. */
  newSession: {
    key: 'Enter starts the session with this message',
    tap: 'Tap the arrow to start the session with this message',
  },
  /** The answer panel, on a question before the last. */
  nextQuestion: {
    key: 'Enter goes to the next question',
    tap: 'Tap Next to go on',
  },
  /** The answer panel, on the last question. */
  answer: { key: 'Enter sends', tap: 'Tap Send answer to send it' },
  /** The session composer, once kagent has reported the runtime lost. */
  runtimeLost: {
    key: 'Enter starts it',
    tap: 'Tap the button below to start it',
  },
} satisfies Record<string, SendKeyCaptionOptions>;
