import { FormEvent, useState } from 'react';
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
import { GSMarkdownContent } from '@giantswarm/backstage-plugin-ui-react';
import type {
  ConfirmationAnswer,
  PendingAnswer,
} from '../../hooks/useAnswerConfirmation';
import type { PendingConfirmation } from '../../lib/kagentHitl';
import { MESSAGE_TEXT_MAX_LENGTH } from '../SessionComposer';

const useStyles = makeStyles(theme => ({
  // The same left rule `TimelineEntry` draws, in the colour it uses for a *user*
  // entry: this is the user's turn in the conversation, and once submitted the
  // answer appears as a "You" message with exactly this border. Without it the
  // options read as a detached form pasted under the transcript.
  panel: {
    paddingLeft: theme.spacing(1.5),
    borderLeft: `2px solid ${theme.palette.primary.main}`,
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
 */
export function PendingConfirmationPanel({
  pending,
  isAnswering,
  error,
  restore,
  onAnswer,
  isUserScoped,
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
    pending.questions.map(
      (_, index) => restore?.answers?.[index]?.join(', ') ?? '',
    ),
  );
  const [reason, setReason] = useState(restore?.rejectionReason ?? '');
  const [showReason, setShowReason] = useState(false);

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

  // Every question must have something. kagent treats a short or empty entry as
  // "not answered" rather than an error, so submitting a partial set would resume
  // the task with a question silently dropped — the agent then continues on a
  // premise nobody supplied. Declining is the way to answer nothing.
  const isComplete = answers.every(entry => entry.length > 0);
  const isReasonTooLong = reason.trim().length > MESSAGE_TEXT_MAX_LENGTH;
  const canSubmit = isComplete && !isReasonTooLong && !isAnswering;

  // "Approve" for a permission request, "Send answer" for a question: the two read
  // completely differently, and calling a question's reply an approval would
  // misdescribe what the button does.
  let submitLabel: string;
  if (isAnswering) {
    submitLabel = 'Sending…';
  } else {
    submitLabel = isQuestion ? 'Send answer' : 'Approve';
  }

  /** The words to show in the transcript. Never reaches the model — see above. */
  const answerText = answers
    .map(entry => entry.join(', '))
    .filter(Boolean)
    .join('\n');

  const submit = (event: FormEvent) => {
    event.preventDefault();
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

  return (
    <form onSubmit={submit}>
      <Flex direction="column" gap="3" className={classes.panel}>
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
              {showQuestionText && (
                <GSMarkdownContent content={question.question} />
              )}

              {question.choices &&
                (question.multiple ? (
                  <CheckboxGroup
                    aria-label="Choices"
                    value={chosen[index] ?? []}
                    onChange={values => setChoices(index, values)}
                    isDisabled={isAnswering}
                  >
                    {question.choices.map(choice => (
                      <Checkbox key={choice} value={choice}>
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
                      <Radio key={choice} value={choice}>
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
                isDisabled={isAnswering}
                rows={2}
              />
            </Flex>
          ))
        ) : (
          <Text variant="body-medium">
            {pending.toolName
              ? `The agent is asking permission to run ${pending.toolName}.`
              : 'The agent is asking permission to continue.'}
          </Text>
        )}

        {showReason && (
          <TextAreaField
            // No `aria-label`: the visible label is the accessible name, and
            // giving both leaves the two able to disagree.
            label="Reason (optional)"
            placeholder="Why not?"
            value={reason}
            onChange={setReason}
            isDisabled={isAnswering}
            rows={2}
          />
        )}

        <Flex align="center" justify="between" gap="2">
          <Text variant="body-small" color="secondary">
            {isReasonTooLong
              ? `That reason is ${reason.trim().length} characters; the limit is ${MESSAGE_TEXT_MAX_LENGTH}.`
              : 'Answering resumes the agent where it stopped.'}
          </Text>
          <Flex align="center" gap="2">
            <Button
              variant="secondary"
              isDisabled={isAnswering}
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
