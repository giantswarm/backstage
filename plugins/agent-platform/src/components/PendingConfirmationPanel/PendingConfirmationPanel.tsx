import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  CheckboxGroup,
  Flex,
  Radio,
  RadioGroup,
  Text,
  TextAreaField,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import SecurityIcon from '@material-ui/icons/Security';
import { MessageMarkdown } from '../SessionTimeline/MessageMarkdown';
import { formatPayload, humanizeToolName } from '../SessionTimeline/helpers';
import type {
  ConfirmationAnswer,
  PendingAnswer,
} from '../../hooks/useAnswerConfirmation';
import type { PendingConfirmation } from '../../lib/kagentHitl';
import { MESSAGE_TEXT_MAX_LENGTH } from '../SessionComposer';
import { isSendKey } from '../../lib/sendKey';

const useStyles = makeStyles(theme => ({
  // The same left rule `TimelineEntry` draws, in the colour it uses for a *user*
  // entry: this is the user's turn in the conversation, and once submitted the
  // answer appears as a "You" message with exactly this border. Without it the
  // options read as a detached form pasted under the transcript.
  panel: {
    paddingLeft: theme.spacing(1.5),
    borderLeft: `2px solid ${theme.palette.primary.main}`,
  },
  // An approval is the prototype's in-chat permission card: a warm-bordered
  // surface that stands apart from the conversation, because what it asks for
  // changes things outside it. Colours ride the shell's warning tokens with the
  // theme as fallback, so classic chrome keeps a sensible palette.
  approvalCard: {
    border: '1px solid var(--bui-border-warning, #f2c9a3)',
    backgroundColor: 'var(--agent-platform-approval-bg, #fff8f1)',
    borderRadius: 'var(--bui-radius-3, 14px)',
    padding: theme.spacing(2, 2.5),
  },
  approvalHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1.5),
  },
  approvalIcon: {
    width: 30,
    height: 30,
    flex: 'none',
    borderRadius: '50%',
    backgroundColor: 'var(--bui-bg-warning, #ffe9d6)',
    color: 'var(--bui-fg-warning-on-bg, #8a3f00)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    '& svg': {
      width: 16,
      height: 16,
    },
  },
  // The accent for an action with effects outside the conversation — the
  // reason the card interrupts at all.
  changesThings: {
    flex: 'none',
    alignSelf: 'flex-start',
    display: 'inline-flex',
    alignItems: 'center',
    height: 20,
    padding: theme.spacing(0, 1),
    borderRadius: 999,
    backgroundColor: 'var(--bui-bg-warning, #ffe9d6)',
    color: 'var(--bui-fg-warning-on-bg, #8a3f00)',
    fontSize: '0.71875rem',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  // What Allow would run, on its own quiet surface inside the card.
  proposedArgs: {
    margin: 0,
    backgroundColor: 'var(--bui-bg-neutral-1, #ffffff)',
    border: '1px solid var(--bui-border-warning, #f0dcc8)',
    borderRadius: 'var(--bui-radius-2, 10px)',
    padding: theme.spacing(1.5),
    fontFamily: 'monospace',
    fontSize: '0.8125rem',
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    maxHeight: 280,
    overflowY: 'auto',
  },
  // bui's form controls are sized for dense forms — 12px labels against the
  // conversation's 16px/24px. A question's options *are* conversation, so they are
  // brought up to match rather than left looking like fine print.
  conversationText: {
    '& label': {
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    '& textarea': {
      fontSize: '1rem',
      lineHeight: 1.5,
    },
  },
}));

export type PendingConfirmationPanelProps = {
  pending: PendingConfirmation;
  isAnswering: boolean;
  error?: string;
  /** A failed attempt's choices, put back so they are not lost. */
  /**
   * A failed attempt, so it is not lost. Restored into the free-text boxes rather
   * than back onto the choices: a failed answer's values are strings, and which of
   * them were clicked and which were typed is not recoverable from the wire form.
   * Putting them all in the box keeps every word the user wrote.
   */
  restore?: PendingAnswer | null;
  onAnswer: (answer: ConfirmationAnswer) => void;
  /**
   * From the `/me` probe. `false` means this kagent does not scope sessions to
   * individual users, so the question may have been put to somebody else — the
   * same caveat the rename and delete dialogs carry.
   */
  isUserScoped?: boolean;
  /**
   * Display name of the session's agent, so the permission card can say who is
   * asking. Falls back to "The agent".
   */
  agentName?: string;
};

/**
 * Answer what the agent is waiting on.
 *
 * Rendered in place of the reply composer, because it is not an alternative to it:
 * while a confirmation is open, a plain message cannot move the session on. kagent
 * suspends the task on the agent's own tool call, and a reply that does not name
 * that task starts a new one — the agent reads the words, the suspended call never
 * gets its response, and the session waits forever. That is not hypothetical: every
 * question answered from Slack on this fleet has left its task suspended, because
 * klaus-gateway sends the task id in a field the A2A server ignores.
 *
 * Two shapes, discriminated by what the agent actually asked:
 *
 * - **A question** (`ask_user`) — one or more prompts, each either a choice list or
 *   free text. Answers are positional and each is a list, even for a single choice.
 * - **An approval** — "may I run this tool", which takes a yes or a no and an
 *   optional reason.
 *
 * There is deliberately **no free-text box alongside a choice list**, even though a
 * choice like "Something else (I'll explain)" invites one. The only place extra
 * words could go is the message's text part, and both kagent executors discard the
 * inbound message entirely and substitute a synthesised tool response — so those
 * words would appear in the transcript and never reach the model. Offering the box
 * would be offering to be ignored. Picking that choice lets the agent ask again,
 * which is the mechanism kagent actually has.
 *
 * **Enter sends from any answer control** — a radio, a checkbox or the text box —
 * with Shift+Enter for a newline in the box, the same rule as the composers (see
 * {@link isSendKey}). Handled explicitly rather than left to the browser: a textarea
 * never submits its form on Enter, and whether a focused radio does is
 * browser-specific, so without this the answer could only be sent by reaching the
 * button. In the **reason** box Enter confirms the decline instead: that box only
 * exists because Decline was pressed, and sending an approval from it would do the
 * opposite of what the user is in the middle of.
 *
 * **A question takes the focus when it appears** — the first choice, or the answer
 * box when there are no choices — and again when a follow-up question replaces it.
 * The user was typing in the composer below, which is disabled while the question
 * stands, so the focus would otherwise fall to `<body>` and the answer would start
 * with a click or a Tab hunt. An **approval** takes nothing: its only controls are
 * Allow and Decline, and focusing either would let a stray Enter grant or refuse
 * a side-effecting tool call.
 */
export function PendingConfirmationPanel({
  pending,
  isAnswering,
  error,
  restore,
  onAnswer,
  isUserScoped,
  agentName,
}: PendingConfirmationPanelProps) {
  const classes = useStyles();
  const isQuestion = pending.asks === 'input' && pending.questions.length > 0;
  const showQuestionText = pending.questions.length > 1;

  // Chosen options and typed words are held apart, then combined at submit. They
  // are not alternatives: kagent's `answer` is a list of strings, so a question can
  // legitimately be answered with a choice, with prose, or with both — and its own
  // UI offers a "Type your own answer" box beside every choice list for exactly
  // that reason. Merging them into one state would make "I picked b *and* wrote
  // why" unrepresentable.
  const [chosen, setChosen] = useState<string[][]>(() =>
    pending.questions.map(() => []),
  );
  const [typed, setTyped] = useState<string[]>(() =>
    pending.questions.map(() => ''),
  );
  const [reason, setReason] = useState('');
  const [showReason, setShowReason] = useState(false);

  /**
   * What is being asked, as a value that changes when the question does.
   *
   * **Not `pending.taskId`**: answering resumes the *same* task, so a task that
   * suspends again to ask a follow-up keeps its id. The id is therefore stable
   * across exactly the transition this needs to detect.
   */
  const questionSignature = JSON.stringify(
    pending.questions.map(question => [
      question.question,
      question.choices ?? [],
      question.multiple,
    ]),
  );

  // Reset when the question changes, in the render phase — the panel does **not**
  // unmount between two consecutive confirmations. `bottomControl` keeps rendering
  // the same element type, so React reconciles rather than remounts, and without
  // this the previous answer survives into the new question: its values match none
  // of the new choices so nothing looks selected, yet the answer counts as complete
  // and `Send answer` submits the *old* answer against the *new* question.
  // Focus the first answer control for each question — on mount and whenever the
  // question changes (the panel stays mounted across consecutive confirmations).
  // Not for an approval; see the component doc.
  const formRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (!isQuestion) {
      return;
    }
    formRef.current
      ?.querySelector<HTMLElement>(
        'input[type="radio"], input[type="checkbox"], textarea',
      )
      ?.focus();
  }, [isQuestion, questionSignature]);

  const seededFor = useRef(questionSignature);
  const restoredId = useRef<string | undefined>(undefined);
  if (seededFor.current !== questionSignature) {
    seededFor.current = questionSignature;
    // A failed attempt at the previous question must not be restored into this
    // one, so it counts as already consumed.
    restoredId.current = restore?.messageId;
    setChosen(pending.questions.map(() => []));
    setTyped(pending.questions.map(() => ''));
    setReason('');
    setShowReason(false);
  } else if (restore && restoredId.current !== restore.messageId) {
    // Applied here rather than from a `useState` initializer, which only ever runs
    // at mount — and `restore` is null then, because it is the *previous attempt's*
    // failure and the panel stays mounted across it. Seeding from it at mount was
    // dead code that only ever "worked" in a test that rendered a fresh panel with
    // `restore` already set. Same render-phase pattern `SessionComposer` uses.
    restoredId.current = restore.messageId;
    // The choices go too, and that is the whole point: `restore` is the *submitted
    // payload*, so each entry already holds the picked options followed by the typed
    // words. The panel stayed mounted across the failure — the premise of this
    // branch — so `chosen` still holds that same selection, and seeding only `typed`
    // fed every choice into the answer twice.
    //
    // Putting the lot in `typed` is also the honest rendering: which values were
    // clicked and which were typed is not recoverable from the payload, so the
    // field now shows exactly what will be sent.
    setChosen(pending.questions.map(() => []));
    setTyped(
      pending.questions.map(
        (_, index) => restore.answers?.[index]?.join(', ') ?? '',
      ),
    );
    setReason(restore.rejectionReason ?? '');
  }

  const setChoices = (index: number, values: string[]) =>
    setChosen(current =>
      current.map((entry, at) => (at === index ? values : entry)),
    );
  const setTypedAt = (index: number, value: string) =>
    setTyped(current =>
      current.map((entry, at) => (at === index ? value : entry)),
    );

  // Choices first, then the user's own words — the order the agent reads them in,
  // and the order they appear on screen.
  const answers = pending.questions.map((_, index) => {
    const words = typed[index]?.trim();
    return [...(chosen[index] ?? []), ...(words ? [words] : [])];
  });

  /** The words to show in the transcript. Never reaches the model — see above. */
  const answerText = answers
    .map(entry => entry.join(', '))
    .filter(Boolean)
    .join('\n');

  // Bounded up front, as both composers bound theirs. This text is sent as the
  // message's `text`, which the route rejects above the same limit — so without
  // this a pasted log excerpt left Send enabled and came back as a raw validator
  // message for a limit the panel had never mentioned.
  const isAnswerTooLong = answerText.length > MESSAGE_TEXT_MAX_LENGTH;

  // Every question must have something. kagent treats a short or empty entry as
  // "not answered" rather than an error, so submitting a partial set would resume
  // the task with a question silently dropped — the agent then continues on a
  // premise nobody supplied. Declining is the way to answer nothing.
  const isComplete = answers.every(entry => entry.length > 0);
  const isReasonTooLong = reason.trim().length > MESSAGE_TEXT_MAX_LENGTH;
  const canSubmit = isComplete && !isAnswerTooLong && !isAnswering;

  // "Allow" for a permission request — the prototype's word, and the honest
  // one: pressing it lets the proposed call run. "Send answer" for a question:
  // the two read completely differently, and calling a question's reply an
  // approval would misdescribe what the button does.
  let submitLabel: string;
  if (isAnswering) {
    submitLabel = 'Sending…';
  } else {
    submitLabel = isQuestion ? 'Send answer' : 'Allow';
  }

  // A permission request carries no resting caption: its reassurance ("Nothing
  // is sent until you allow it.") stands under its title, as the prototype
  // places it, and its buttons sit at the card's end.
  let caption: string | undefined;
  if (isAnswerTooLong) {
    caption = `That answer is ${answerText.length} characters; the limit is ${MESSAGE_TEXT_MAX_LENGTH}.`;
  } else if (isReasonTooLong) {
    caption = `That reason is ${reason.trim().length} characters; the limit is ${MESSAGE_TEXT_MAX_LENGTH}.`;
  } else if (isQuestion) {
    caption =
      'Answering resumes the agent where it stopped. Enter sends, Shift+Enter for a new line.';
  }

  const send = () => {
    if (!canSubmit) {
      return;
    }
    onAnswer({
      taskId: pending.taskId,
      decision: 'approve',
      ...(isQuestion && { answers }),
      ...(answerText && { text: answerText }),
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  // On each control rather than the form: jsx-a11y forbids key handlers on a
  // <form>, and a handler there would also catch Enter on the buttons, where
  // react-aria already turns it into a press — Enter on "Decline" must not send an
  // approval as well. Prevented even when nothing can be sent, so Enter never
  // breaks the line in the box.
  const handleAnswerKeyDown = (event: KeyboardEvent) => {
    if (isSendKey(event)) {
      event.preventDefault();
      send();
    }
  };

  const decline = () => {
    if (isAnswering || isReasonTooLong) {
      return;
    }
    onAnswer({
      taskId: pending.taskId,
      decision: 'reject',
      ...(reason.trim() && { rejectionReason: reason.trim() }),
      ...(reason.trim() && { text: reason.trim() }),
    });
  };

  const handleReasonKeyDown = (event: KeyboardEvent) => {
    if (isSendKey(event)) {
      event.preventDefault();
      decline();
    }
  };

  // What the card says the agent wants. The tool's name as words — the exact
  // identifier stays in the timeline's technical view — plus the connector it
  // would go through, which is part of what is being consented to.
  const proposedArgs = isQuestion ? undefined : formatPayload(pending.args);
  const asker = agentName || 'The agent';
  let approvalTitle: string;
  if (pending.toolName) {
    approvalTitle = `${asker} wants to run “${humanizeToolName(pending.toolName)}”${
      pending.via ? ` via ${pending.via}` : ''
    }`;
  } else {
    approvalTitle = `${asker} is asking permission to continue`;
  }

  return (
    <form
      onSubmit={handleSubmit}
      ref={formRef}
      aria-label={isQuestion ? 'Question from the agent' : 'Permission request'}
    >
      <Flex
        direction="column"
        gap="3"
        className={isQuestion ? classes.panel : classes.approvalCard}
      >
        {error && (
          <Alert status="danger" title="Answer not sent" description={error} />
        )}

        {isUserScoped === false && (
          <Text variant="body-small" color="secondary">
            This kagent deployment does not scope sessions to individual users,
            so this question may have been put to somebody else.
          </Text>
        )}

        {isQuestion ? (
          pending.questions.map((question, index) => (
            // Keyed on the question text plus its position: the text is what the
            // user reads, and the position is what makes duplicates distinct.
            <Flex
              direction="column"
              gap="2"
              key={`${index}:${question.question}`}
              className={classes.conversationText}
            >
              {/* Repeated here **only** when there is more than one question.
                  The timeline already renders the agent's question directly
                  above this panel, as prose in the conversation where it belongs
                  — so for the usual single question, printing it again put the
                  same paragraph on screen twice. With several, the pairing of
                  choices to question is not otherwise recoverable, and a
                  duplicated line is the lesser problem.

                  Markdown, because these are written for a chat client and use
                  it freely — the live examples contain bold and hard breaks. */}
              {showQuestionText && <MessageMarkdown text={question.question} />}

              {question.choices &&
                (question.multiple ? (
                  <CheckboxGroup
                    aria-label="Choices"
                    value={chosen[index] ?? []}
                    onChange={values => setChoices(index, values)}
                    isDisabled={isAnswering}
                  >
                    {question.choices.map(choice => (
                      <Checkbox
                        key={choice}
                        value={choice}
                        onKeyDown={handleAnswerKeyDown}
                      >
                        {choice}
                      </Checkbox>
                    ))}
                  </CheckboxGroup>
                ) : (
                  <RadioGroup
                    aria-label="Choices"
                    value={chosen[index]?.[0] ?? null}
                    onChange={value => setChoices(index, value ? [value] : [])}
                    isDisabled={isAnswering}
                  >
                    {question.choices.map(choice => (
                      <Radio
                        key={choice}
                        value={choice}
                        onKeyDown={handleAnswerKeyDown}
                      >
                        {choice}
                      </Radio>
                    ))}
                  </RadioGroup>
                ))}

              {/* Offered for **every** question, choices or not. A choice list is
                  not exhaustive — the live examples end in "Something else (I'll
                  explain)" — and typed words do reach the agent, because they go
                  into the `answer` array rather than the message's text part.
                  kagent's own UI puts a "Type your own answer" box beside every
                  choice list for the same reason. */}
              <TextAreaField
                aria-label="Answer"
                placeholder={
                  question.choices ? 'Or type your own answer…' : 'Your answer…'
                }
                value={typed[index] ?? ''}
                onChange={value => setTypedAt(index, value)}
                onKeyDown={handleAnswerKeyDown}
                isDisabled={isAnswering}
                rows={2}
              />
            </Flex>
          ))
        ) : (
          <>
            <div className={classes.approvalHeader}>
              <span className={classes.approvalIcon} aria-hidden="true">
                <SecurityIcon />
              </span>
              <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
                <Text variant="body-medium" weight="bold">
                  {approvalTitle}
                </Text>
                <Text variant="body-small" color="secondary">
                  Nothing is sent until you allow it.
                </Text>
              </Flex>
              {/* The accent: this call has effects outside the conversation,
                  which is why the agent stopped to ask. */}
              <span className={classes.changesThings}>Changes things</span>
            </div>
            {/* The exact arguments Allow would run — the one place they must be
                visible whatever the timeline's plain/technical register says. */}
            {proposedArgs && (
              <pre className={classes.proposedArgs}>{proposedArgs}</pre>
            )}
          </>
        )}

        {showReason && (
          <TextAreaField
            // No `aria-label`: the visible label is the accessible name, and
            // giving both leaves the two able to disagree.
            label="Reason (optional)"
            placeholder="Why not?"
            value={reason}
            onChange={setReason}
            onKeyDown={handleReasonKeyDown}
            isDisabled={isAnswering}
            rows={2}
          />
        )}

        {/* The row wraps so at phone width the buttons drop under the caption
            instead of squeezing beside it. */}
        <Flex
          align="center"
          justify={caption ? 'between' : 'end'}
          gap="2"
          style={{ flexWrap: 'wrap' }}
        >
          {caption && (
            <Text variant="body-small" color="secondary">
              {caption}
            </Text>
          )}
          <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              // Disabled rather than left to `decline()`'s silent early return: a
              // control that does nothing when pressed is worse than one that is
              // visibly unavailable, and the caption cannot be relied on to explain
              // — an over-long *answer* outranks the reason in it, so the decline
              // path's only explanation can be hidden exactly when it is needed.
              isDisabled={isAnswering || (showReason && isReasonTooLong)}
              onPress={() => (showReason ? decline() : setShowReason(true))}
            >
              {showReason ? 'Confirm decline' : 'Decline'}
            </Button>
            <Button variant="primary" type="submit" isDisabled={!canSubmit}>
              {submitLabel}
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </form>
  );
}
