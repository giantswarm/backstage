import { FormEvent, KeyboardEvent, useState } from 'react';
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
  error?: string;
  /** Receives the trimmed text. Failure is reported through `error`. */
  onSubmit: (text: string) => void;
};

/**
 * The message box at the foot of a session.
 *
 * The field is cleared on submit rather than when the request succeeds. The
 * message is rendered into the conversation optimistically at the same moment, so
 * it stays visible either way — and a turn runs for minutes, which is far too
 * long to hold a user's text hostage in a disabled box. When a send does fail the
 * caller surfaces `error`, and the message it names is still in the transcript.
 *
 * Enter inserts a newline; **Cmd/Ctrl+Enter submits**. A prompt is often
 * multi-line, so Enter-to-send would truncate more messages than it saved.
 */
export function SessionComposer({
  isAgentWorking,
  isFinished,
  error,
  onSubmit,
}: SessionComposerProps) {
  const [value, setValue] = useState('');

  const text = value.trim();
  const isTooLong = text.length > MESSAGE_TEXT_MAX_LENGTH;
  const canSubmit = Boolean(text) && !isTooLong && !isAgentWorking;

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
  if (isAgentWorking) {
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
          isDisabled={isAgentWorking}
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
