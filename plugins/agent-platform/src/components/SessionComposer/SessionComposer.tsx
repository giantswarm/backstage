import { FormEvent, KeyboardEvent, useRef, useState } from 'react';
import { Alert, Button, Flex, Text, TextAreaField } from '@backstage/ui';

/**
 * Longest message this composer will submit.
 *
 * Not a kagent limit — nothing upstream validates the text — but ours, generous
 * because pasting logs or a manifest into a prompt is a normal thing to do. The
 * backend enforces the same bound, because a `maxLength` on an input is a
 * courtesy and not a guard.
 *
 * Counts characters rather than bytes, in both places.
 *
 * Must match MESSAGE_TEXT_MAX_LENGTH in plugins/agent-platform-backend.
 */
export const MESSAGE_TEXT_MAX_LENGTH = 32_000;

export type SessionComposerProps = {
  /**
   * Whether the agent is working on a reply, from the session's A2A state and
   * the in-flight send together — the caller derives it, because neither signal
   * spans a whole turn on its own.
   *
   * Sending is withheld while it is: kagent has no notion of a queued follow-up,
   * so a second message during a turn is not a queued reply but a competing one.
   */
  isAgentWorking: boolean;
  /**
   * Whether the last turn reached a terminal state, which changes what sending
   * means — a finished session is resumed by it rather than continued.
   */
  isFinished: boolean;
  /**
   * Why the composer cannot be used right now, when it cannot.
   *
   * Disables the field and replaces the caption, rather than the caller removing
   * the composer altogether. Used while a confirmation is open: a plain message
   * genuinely cannot move the session on then, but taking the message box off the
   * screen reads as the feature being missing rather than blocked. kagent's own UI
   * makes the same call — it leaves the box in place with `Awaiting approval…` in
   * it.
   */
  disabledReason?: string;
  error?: string;
  /**
   * A message whose send failed, whose text is put back into the box.
   *
   * The field is cleared on submit, so after a failure this is the only remaining
   * copy — without it a pasted manifest is gone for good. Identified rather than
   * passed as a bare string so that resubmitting the *same* text and failing again
   * restores it again; each attempt carries its own `messageId`.
   */
  restore?: { messageId: string; text: string } | null;
  /** Receives the trimmed text. Failure is reported through `error`. */
  onSubmit: (text: string) => void;
};

/**
 * The message box at the foot of a session.
 *
 * The field is cleared on submit rather than when the request succeeds: the message
 * is rendered into the conversation optimistically at that moment, and a turn runs
 * for minutes, which is far too long to hold a user's text hostage in a disabled
 * box.
 *
 * That optimistic copy is dropped when a send *fails*, though — nothing was
 * recorded, so the transcript must not keep showing it — which would leave the text
 * nowhere at all. Hence `restore`: on failure the caller hands it back and it
 * returns to the box, next to the error saying why.
 *
 * Enter inserts a newline; **Cmd/Ctrl+Enter submits**. A prompt is often
 * multi-line, so Enter-to-send would truncate more messages than it saved.
 */
export function SessionComposer({
  isAgentWorking,
  isFinished,
  disabledReason,
  error,
  restore,
  onSubmit,
}: SessionComposerProps) {
  const [value, setValue] = useState('');

  // Put a failed message's text back, once per attempt. Tracked by id rather than
  // by comparing text so that a second failure of the same text restores it again,
  // and so that a restore never fires twice and overwrites an edit in progress.
  const restoredId = useRef<string | undefined>(undefined);
  if (restore && restoredId.current !== restore.messageId) {
    restoredId.current = restore.messageId;
    setValue(restore.text);
  }

  const text = value.trim();
  const isTooLong = text.length > MESSAGE_TEXT_MAX_LENGTH;
  const isDisabled = isAgentWorking || Boolean(disabledReason);
  const canSubmit = Boolean(text) && !isTooLong && !isDisabled;

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    onSubmit(text);
    setValue('');
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  let caption: string;
  if (disabledReason) {
    caption = disabledReason;
  } else if (isAgentWorking) {
    caption = 'The agent is working. You can reply once this turn finishes.';
  } else if (isFinished) {
    caption = 'Sending a message resumes this finished session.';
  } else {
    caption = 'Your reply is added to the conversation.';
  }

  return (
    <form onSubmit={handleSubmit}>
      <Flex direction="column" gap="2">
        {error && (
          <Alert status="danger" title="Message not sent" description={error} />
        )}

        <TextAreaField
          aria-label="Message"
          placeholder={
            isFinished
              ? 'Send a message to resume this session…'
              : 'Send a message to this session…'
          }
          value={value}
          onChange={setValue}
          onKeyDown={handleKeyDown}
          isDisabled={isDisabled}
          rows={3}
        />

        <Flex align="center" justify="between" gap="2">
          <Text variant="body-small" color="secondary">
            {isTooLong
              ? `That message is ${text.length} characters; the limit is ${MESSAGE_TEXT_MAX_LENGTH}.`
              : caption}
          </Text>
          <Button type="submit" isDisabled={!canSubmit}>
            Send
          </Button>
        </Flex>
      </Flex>
    </form>
  );
}
