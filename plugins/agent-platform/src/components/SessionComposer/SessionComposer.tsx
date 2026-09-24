import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  ButtonIcon,
  Flex,
  Text,
  TextAreaField,
} from '@backstage/ui';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
import StopIcon from '@material-ui/icons/Stop';
import { ComposerFrame } from '@giantswarm/backstage-plugin-ui-react';
import { isSendKey } from '../../lib/sendKey';

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

/** Rows the box shows when empty, and grows to before it scrolls. */
const MIN_ROWS = 2;
const MAX_ROWS = 12;

export type SessionComposerProps = {
  /**
   * Whether the agent is working on a reply, from the session's A2A state and
   * the in-flight send together — the caller derives it, because neither signal
   * spans a whole turn on its own.
   *
   * Sending is withheld while it is: kagent has no notion of a queued follow-up,
   * so a second message during a turn is not a queued reply but a competing one.
   * The box itself stays editable, so the next message can be drafted meanwhile —
   * and so the box keeps focus: a disabled field is blurred by the browser, which
   * is what used to make every send end with a click back into the box.
   */
  isAgentWorking: boolean;
  /**
   * The turn being waited on has stopped reporting progress. Sending stays
   * withheld — kagent still holds the task active and would refuse a second
   * message — but the caption stops promising a reply and points at the cancel
   * instead. Only read while {@link isAgentWorking}.
   */
  isStalled?: boolean;
  /**
   * Focus the box on mount.
   *
   * For the page a just-started session lands on: the user was typing into the
   * composer that created it a moment ago, and the navigation took the focus with
   * it. Putting it into this box is continuity, not stealing — which is why it is
   * opt-in and off for a session merely opened from the list.
   */
  autoFocus?: boolean;
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
  /** Why the last send failed, shown as "Message not sent". */
  error?: string;
  /**
   * Why the last Stop failed, shown as "Stop failed" — its own notice, because
   * a Stop is not a send and the words "Message not sent" over a turn that is
   * still running say the opposite of what happened. The caller words it: the
   * backend's message, with what to do about it where that is known.
   */
  stopError?: string;
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
  /**
   * Stop the turn in progress, when one can be stopped.
   *
   * Offered in place of Send while `isAgentWorking` — the one moment Send is
   * withheld anyway, so the slot is free and the two cannot be confused. Absent
   * means there is nothing to cancel yet: the page does not know the running
   * turn's task, which is the case for the first beat of a send before the
   * stream or the poll has named it.
   */
  onStop?: () => void;
  /** A Stop has been asked for and the server has not answered yet. */
  isStopping?: boolean;
  /**
   * The way out of a session whose runtime kagent cannot bring back: start a
   * new session with the same agent, taking the box's text along.
   *
   * Rendered under the box, as a secondary button while the loss is only
   * suspected — a cold worker can time out once, and sending again is the honest
   * retry — and as the primary one, Send gone, once kagent has reported the
   * runtime lost (`replacesSend`), because a send then fails the same way every
   * time and Enter should do the one thing that works. The action receives
   * whatever is in the box; the caller decides what to carry when it is empty
   * (the message that never got its answer).
   */
  newSession?: {
    /** The button's text — names the agent, so it says where the person lands. */
    label: string;
    /** Receives the trimmed text of the box, which may be empty. */
    onStart: (draft: string) => void;
    /** The new session is being created. */
    isStarting?: boolean;
    /** Send is withheld and this becomes the primary control; Enter starts
     * the session. */
    replacesSend?: boolean;
    /** What the caption says while this is offered. */
    caption: string;
  };
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
 * **Enter sends; Shift+Enter inserts a newline** — see {@link isSendKey} for why,
 * and for the IME case. Enter never inserts a newline, even when nothing can be sent:
 * a key that sometimes sends and sometimes breaks the line is worse than one that
 * sometimes does nothing.
 *
 * **Focus stays in the box.** Only `disabledReason` disables the field; the agent's
 * turn withholds Send and Enter but leaves the box editable, because disabling it
 * blurred it and every send ended with a click back in. When the field *is* disabled
 * and comes back — a confirmation was answered — it takes the focus back, provided
 * nothing else has it: the control that had it was in the panel that just went
 * away, so the focus is on `<body>`, which is nowhere.
 */
export function SessionComposer({
  isAgentWorking,
  isStalled = false,
  isFinished,
  disabledReason,
  error,
  stopError,
  restore,
  autoFocus = false,
  onSubmit,
  onStop,
  isStopping = false,
  newSession,
}: SessionComposerProps) {
  const [value, setValue] = useState('');
  // bui's field forwards its ref to the wrapper, not the textarea.
  const fieldRef = useRef<HTMLDivElement>(null);
  const focusInput = () => fieldRef.current?.querySelector('textarea')?.focus();

  // Put a failed message's text back, once per attempt. Tracked by id rather than
  // by comparing text so that a second failure of the same text restores it again,
  // and so that a restore never fires twice and overwrites an edit in progress.
  //
  // Put back *ahead of* whatever has been typed since: the box stays editable
  // while a send is in flight, so a draft of the next message may already be in
  // it when this one fails, and replacing the draft would lose words to save words.
  const restoredId = useRef<string | undefined>(undefined);
  if (restore && restoredId.current !== restore.messageId) {
    restoredId.current = restore.messageId;
    setValue(draft =>
      draft.trim() ? `${restore.text}\n\n${draft}` : restore.text,
    );
  }

  const text = value.trim();
  const isTooLong = text.length > MESSAGE_TEXT_MAX_LENGTH;
  const isDisabled = Boolean(disabledReason);
  // Once kagent has said the runtime is lost, Send has nothing left to do: it
  // goes, and the new session becomes the primary control — and takes Enter.
  const newSessionReplacesSend = Boolean(newSession?.replacesSend);
  const canSubmit =
    Boolean(text) &&
    !isTooLong &&
    !isDisabled &&
    !isAgentWorking &&
    !newSessionReplacesSend;
  const canStartNewSession =
    Boolean(newSession) && !isTooLong && !isDisabled && !newSession?.isStarting;

  useEffect(() => {
    if (autoFocus) {
      focusInput();
    }
    // On mount only: this is where a navigation dropped the focus, not a
    // subscription to the prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Take the focus back when the field is re-enabled and nothing else holds it.
  // The typical path: the user answered the agent's question from the panel above
  // with Enter, the panel unmounted with the control that had the focus, and the
  // focus fell back to <body>. Skipped when it is anywhere real, so a user who
  // moved on to another control is not yanked back.
  const wasDisabled = useRef(isDisabled);
  useEffect(() => {
    const cameBack = wasDisabled.current && !isDisabled;
    wasDisabled.current = isDisabled;
    if (!cameBack) {
      return;
    }
    const active = document.activeElement;
    if (!active || active === document.body) {
      focusInput();
    }
  }, [isDisabled]);

  const startNewSession = () => {
    if (!newSession || !canStartNewSession) {
      return;
    }
    // Not cleared: the create can fail, and the box is where the words still
    // are. The caller unmounts this composer by navigating once the session
    // exists.
    newSession.onStart(text);
  };

  const submit = () => {
    if (newSessionReplacesSend) {
      startNewSession();
      return;
    }
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
    if (isSendKey(event)) {
      event.preventDefault();
      submit();
    }
  };

  // Stop takes Send's slot while the agent works and the running turn is
  // known. Not while a confirmation is open (`disabledReason` set): waiting on
  // a human is the opposite of running, and there is nothing to cancel.
  const showStop = isAgentWorking && !isDisabled && Boolean(onStop);

  let placeholder = 'Send a message to this session…';
  if (newSessionReplacesSend) {
    placeholder = 'Start a new session with this message…';
  } else if (isFinished) {
    placeholder = 'Send a message to resume this session…';
  }

  let caption: string;
  if (disabledReason) {
    caption = disabledReason;
  } else if (newSession) {
    caption = newSession.caption;
  } else if (isStopping) {
    caption = 'Stopping the agent…';
  } else if (isAgentWorking && isStalled) {
    caption = showStop
      ? 'The agent has stopped reporting progress. Cancel the turn to send again.'
      : 'The agent has stopped reporting progress. You can reply once this turn ends.';
  } else if (isAgentWorking) {
    caption = showStop
      ? 'The agent is working. Stop it, or reply once this turn finishes.'
      : 'The agent is working. You can reply once this turn finishes.';
  } else if (isFinished) {
    caption = 'Sending a message resumes this finished session.';
  } else {
    caption =
      'Your reply is added to the conversation. Enter sends, Shift+Enter for a new line.';
  }

  return (
    <form onSubmit={handleSubmit}>
      <Flex direction="column" gap="2">
        {error && (
          <Alert status="danger" title="Message not sent" description={error} />
        )}
        {stopError && (
          <Alert status="danger" title="Stop failed" description={stopError} />
        )}

        <ComposerFrame
          minRows={MIN_ROWS}
          maxRows={MAX_ROWS}
          isDisabled={isDisabled}
          data-testid="composer-card"
          input={
            <TextAreaField
              ref={fieldRef}
              aria-label="Message"
              placeholder={placeholder}
              value={value}
              onChange={setValue}
              onKeyDown={handleKeyDown}
              isDisabled={isDisabled}
              rows={MIN_ROWS}
            />
          }
          trailing={
            showStop ? (
              // Secondary rather than primary: stopping is not the action
              // this box invites.
              <ButtonIcon
                type="button"
                aria-label="Stop"
                variant="secondary"
                icon={<StopIcon />}
                isPending={isStopping}
                onPress={onStop}
              />
            ) : (
              !newSessionReplacesSend && (
                <ButtonIcon
                  type="submit"
                  aria-label="Send"
                  icon={<ArrowUpwardIcon />}
                  isDisabled={!canSubmit}
                />
              )
            )
          }
        />

        <Text variant="body-small" color={isTooLong ? 'danger' : 'secondary'}>
          {isTooLong
            ? `That message is ${text.length} characters; the limit is ${MESSAGE_TEXT_MAX_LENGTH}.`
            : caption}
        </Text>

        {newSession && (
          // Under the box, not in it: it is a way out of this session, not one
          // of the box's own controls. Worded rather than an icon — an icon
          // could not say where the person lands. `type="button"`: only the
          // primary control submits the form, and while Send is still there,
          // Enter must keep sending.
          <Flex justify="end">
            <Button
              type={newSessionReplacesSend ? 'submit' : 'button'}
              size="small"
              variant={newSessionReplacesSend ? 'primary' : 'secondary'}
              isDisabled={!canStartNewSession}
              isPending={newSession.isStarting}
              onPress={newSessionReplacesSend ? undefined : startNewSession}
            >
              {newSession.label}
            </Button>
          </Flex>
        )}
      </Flex>
    </form>
  );
}
