import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Alert, Flex } from '@backstage/ui';
import { IconButton, InputBase, makeStyles } from '@material-ui/core';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
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

const useStyles = makeStyles(theme => ({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    padding: theme.spacing(1.5, 1.5, 1, 1.5),
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 'var(--bui-radius-3)',
    backgroundColor: theme.palette.background.paper,
    transition: theme.transitions.create(['border-color', 'box-shadow']),
    '&:focus-within': {
      borderColor: theme.palette.primary.main,
    },
  },
  cardDisabled: {
    opacity: 0.7,
  },
  input: {
    fontSize: '0.875rem',
    lineHeight: 1.6,
    padding: 0,
  },
  controls: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: theme.spacing(2),
  },
  caption: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    lineHeight: 1.5,
  },
  captionError: {
    color: theme.palette.error.main,
  },
  send: {
    flexShrink: 0,
    width: 32,
    height: 32,
    color: theme.palette.primary.contrastText,
    backgroundColor: theme.palette.primary.main,
    '&:hover': {
      backgroundColor: theme.palette.primary.dark,
    },
    '&.Mui-disabled': {
      color: theme.palette.action.disabled,
      backgroundColor: theme.palette.action.disabledBackground,
    },
  },
}));

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
  isFinished,
  disabledReason,
  error,
  restore,
  autoFocus = false,
  onSubmit,
}: SessionComposerProps) {
  const classes = useStyles();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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
  const canSubmit =
    Boolean(text) && !isTooLong && !isDisabled && !isAgentWorking;

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
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
      inputRef.current?.focus();
    }
  }, [isDisabled]);

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
    if (isSendKey(event)) {
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
    caption =
      'Your reply is added to the conversation. Enter sends, Shift+Enter for a new line.';
  }

  return (
    <form onSubmit={handleSubmit}>
      <Flex direction="column" gap="2">
        {error && (
          <Alert status="danger" title="Message not sent" description={error} />
        )}

        <div
          className={`${classes.card} ${isDisabled ? classes.cardDisabled : ''}`}
        >
          <InputBase
            className={classes.input}
            fullWidth
            multiline
            minRows={2}
            maxRows={12}
            placeholder={
              isFinished
                ? 'Send a message to resume this session…'
                : 'Send a message to this session…'
            }
            value={value}
            onChange={event => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isDisabled}
            inputRef={inputRef}
            inputProps={{ 'aria-label': 'Message' }}
          />
          <div className={classes.controls}>
            <span
              className={`${classes.caption} ${isTooLong ? classes.captionError : ''}`}
            >
              {isTooLong
                ? `That message is ${text.length} characters; the limit is ${MESSAGE_TEXT_MAX_LENGTH}.`
                : caption}
            </span>
            <IconButton
              type="submit"
              aria-label="Send"
              className={classes.send}
              disabled={!canSubmit}
            >
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
          </div>
        </div>
      </Flex>
    </form>
  );
}
