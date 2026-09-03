import type { KeyboardEvent } from 'react';

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
 * An Enter that **commits an IME composition** is not a send. Typing Japanese or
 * Chinese, Enter confirms the candidate the user is choosing, and the browser marks
 * that keydown with `isComposing`; treating it as a send would fire the message with
 * the last word missing.
 *
 * Shared by every box in a session that takes typed words — the reply composer, the
 * new-session composer and the answer panel — so the rule is stated once and cannot
 * drift between them.
 */
export function isSendKey(event: KeyboardEvent): boolean {
  return (
    event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing
  );
}
