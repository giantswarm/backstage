import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  ButtonIcon,
  Checkbox,
  CheckboxGroup,
  Flex,
  Radio,
  RadioGroup,
  Text,
  TextAreaField,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  PHONE_MEDIA,
  useTouchInput,
} from '@giantswarm/backstage-plugin-ui-react';
import { EffectBadge } from '@giantswarm/backstage-plugin-muster';
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import SecurityIcon from '@material-ui/icons/Security';
import { MessageMarkdown } from '../SessionTimeline/MessageMarkdown';
import type { ConnectorOf } from '../SessionTimeline/TimelineEntry';
import { formatPayload, humanizeToolName } from '../SessionTimeline/helpers';
import type {
  ConfirmationAnswer,
  PendingAnswer,
} from '../../hooks/useAnswerConfirmation';
import type { PendingConfirmation } from '../../lib/kagentHitl';
import { MESSAGE_TEXT_MAX_LENGTH } from '../SessionComposer';
import { isSendKey, sendEnterKeyHint, sendKeyCaption } from '../../lib/sendKey';

/**
 * The tallest the card grows before its body scrolls: about half the view, so
 * the card, the message box under it and the shell's mobile bottom bar all fit
 * on a 375px-wide phone with the conversation still visible above them. The
 * header (what is asked, and the pager) and the actions stay put; only the
 * body between them scrolls.
 */
const CARD_MAX_HEIGHT = 'min(50dvh, 440px)';

/**
 * At phone width (T22 B21) the composer under the card folds to one line, so
 * the card keeps half the view without the 440px cap, and never more than
 * leaves 200px beside the bottom bar — the conversation the person answers
 * from — which binds in landscape, where half the view is little. The body is
 * the card's one scroller there: the proposed arguments flow in it rather
 * than in a second, nested one.
 */
const PHONE_CARD_MAX_HEIGHT =
  'min(50dvh, calc(100dvh - var(--agent-shell-mobile-bar-height, 0px) - 200px))';

const useStyles = makeStyles(theme => ({
  // Attached to the message box: the same border, radius and surface as the
  // composer's frame, so the two read as one control — the box that is blocked
  // and the card that unblocks it — rather than a form pasted under the
  // transcript.
  card: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: CARD_MAX_HEIGHT,
    fallbacks: {
      maxHeight: 'min(50vh, 440px)',
    },
    boxSizing: 'border-box',
    border: '1px solid var(--bui-border-1, #e0e0e0)',
    borderRadius: 'var(--bui-radius-4, 16px)',
    backgroundColor: `var(--bui-bg-neutral-1, ${theme.palette.background.paper})`,
    padding: theme.spacing(1.5, 2),
    gap: theme.spacing(1.5),
    [PHONE_MEDIA]: {
      maxHeight: PHONE_CARD_MAX_HEIGHT,
    },
  },
  // An approval keeps the prototype's warm permission surface: what it asks
  // for changes things outside the conversation. Colours ride the shell's
  // warning tokens with the theme as fallback, so classic chrome keeps a
  // sensible palette.
  approvalCard: {
    borderColor: 'var(--bui-border-warning, #f2c9a3)',
    backgroundColor: 'var(--agent-platform-approval-bg, #fff8f1)',
  },
  header: {
    flex: 'none',
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1.5),
  },
  // The pager row: "Question 1 of 3" and its arrows.
  pager: {
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
    minHeight: 32,
  },
  // Everything between the header and the actions. Scrolls on its own when a
  // long question or a large proposed call would push the dock past the view.
  body: {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
  },
  actions: {
    flex: 'none',
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
  // reason the card interrupts at all — as the shared effect badge.
  changesThings: {
    flex: 'none',
    alignSelf: 'flex-start',
    display: 'inline-flex',
  },
  // What Allow would run, on its own quiet surface inside the card. Shorter
  // than it was in the conversation: the card is docked, and the body around
  // it scrolls anyway.
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
    maxHeight: 160,
    overflowY: 'auto',
    [PHONE_MEDIA]: {
      maxHeight: 'none',
      overflowY: 'visible',
    },
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
  /** Names the connector the tool belongs to, as Customize does (UX review M2). */
  connectorOf?: ConnectorOf;
};

/**
 * Answer what the agent is waiting on — the live card attached to the message box.
 *
 * Docked with the composer at the foot of the view, the way a chat app puts the
 * agent's question in its input bar (T40): the conversation scrolls behind it,
 * and the card is where the answer is given. The timeline keeps the record —
 * what was asked, and once answered, what was replied or decided — so this card
 * renders only the live, pending state and goes once the answer is taken.
 *
 * **Several questions are paged**, one at a time with "Question 1 of N", rather
 * than stacked: a docked card has a phone's half-screen to work with, and a
 * stack of choice lists would push the box off it. The answers are still sent
 * together and positionally — kagent resumes the task once, with every answer —
 * so Send is offered on the last page and waits until each question has one.
 *
 * It disables the composer rather than replacing it, because it is not an
 * alternative to it: while a confirmation is open, a plain message cannot move
 * the session on. kagent
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
 * **Only an approval can be declined.** kagent's question response has no "no":
 * the backend refuses a rejected `ask_user` ("A question cannot be rejected;
 * answer it, or leave the session waiting"), so offering Decline on a question
 * offered a button that always failed. A question is answered — a choice, or
 * the user's own words, which can say "none of these" — or left waiting.
 *
 * **Every question gets a free-text box, a choice list or not** ("Or type your
 * own answer…" beside the choices). A choice list is not exhaustive — the live
 * examples end in "Something else (I'll explain)" — and the typed words do reach
 * the model: they go into the question's `answer` list after the picked choices,
 * not into the message's text part, which both kagent executors discard in favour
 * of a synthesised tool response (that text is the transcript's copy only). kagent's
 * own UI offers the same box beside every choice list.
 *
 * **Enter sends from any answer control** — a radio, a checkbox or the text box —
 * with Shift+Enter for a newline in the box, the same rule as the composers (see
 * {@link isSendKey}); on touch input Enter breaks the line and only the buttons
 * send. Handled explicitly rather than left to the browser: a textarea never
 * submits its form on Enter, and whether a focused radio does is
 * browser-specific, so without this the answer could only be sent by reaching the
 * button. In the **reason** box Enter confirms the decline instead: that box only
 * exists because Decline was pressed, and sending an approval from it would do the
 * opposite of what the user is in the middle of.
 *
 * On a page that is not the last, Enter moves on to the next question instead,
 * once this one has an answer.
 *
 * **A question takes the focus when it appears** — the first choice, or the answer
 * box when there are no choices — and again when a follow-up question replaces it
 * or the pager turns to another one.
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
  connectorOf,
}: PendingConfirmationPanelProps) {
  const classes = useStyles();
  const touch = useTouchInput();
  const isQuestion = pending.asks === 'input' && pending.questions.length > 0;
  const questionCount = pending.questions.length;
  const isPaged = isQuestion && questionCount > 1;

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
  // Whether Send was pressed (or Enter hit) with an answer missing. The hint
  // naming the missing question waits for that — the T31 rule: no complaint
  // before the first blocked attempt, so arriving at a page is not scolded.
  const [attemptedSend, setAttemptedSend] = useState(false);
  // Which question the pager shows. Clamped on read, so a follow-up with fewer
  // questions can never leave it pointing past the end.
  const [page, setPage] = useState(0);
  const pageIndex = Math.min(page, Math.max(questionCount - 1, 0));
  const isLastPage = !isPaged || pageIndex === questionCount - 1;

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
  // Focus the first answer control for each question — on mount, whenever the
  // question changes (the panel stays mounted across consecutive confirmations)
  // and whenever the pager turns to another one. Not for an approval; see the
  // component doc.
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
  }, [isQuestion, questionSignature, pageIndex]);

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
    setPage(0);
    setAttemptedSend(false);
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
  // premise nobody supplied.
  const isComplete = answers.every(entry => entry.length > 0);
  const isReasonTooLong = reason.trim().length > MESSAGE_TEXT_MAX_LENGTH;
  const canSubmit = isComplete && !isAnswerTooLong && !isAnswering;
  // On a page that is not the last, the primary control moves on rather than
  // sends — and only once this page's question has an answer, so the flow
  // never walks past a question by accident. The pager arrows still go anywhere.
  const canAdvance =
    !isLastPage && (answers[pageIndex]?.length ?? 0) > 0 && !isAnswering;
  const firstUnanswered = answers.findIndex(entry => entry.length === 0);
  const isPageAnswered = (answers[pageIndex]?.length ?? 0) > 0;
  // Send is pressable on the last page once the question in view is answered,
  // even if an earlier page is not: pressing it then says which one is missing
  // (the reason is out of sight, so a merely disabled button would not). With
  // the question in view unanswered, a disabled Send explains itself.
  const isSendDisabled =
    isAnswering || isAnswerTooLong || (!isComplete && !isPageAnswered);
  const advance = () => {
    if (canAdvance) {
      setPage(pageIndex + 1);
    }
  };

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
  } else if (isPaged && isLastPage && !isComplete && attemptedSend) {
    // Send was refused, and on the last page the reason is out of sight.
    caption = `Question ${firstUnanswered + 1} still needs an answer.`;
  } else if (isQuestion && !isLastPage) {
    caption = sendKeyCaption(
      { key: 'Enter goes to the next question', tap: 'Tap Next to go on' },
      touch,
    );
  } else if (isQuestion) {
    caption = `Answering resumes the agent where it stopped. ${sendKeyCaption(
      { key: 'Enter sends', tap: 'Tap Send answer to send it' },
      touch,
    )}`;
  }

  const send = () => {
    if (!canSubmit) {
      if (!isAnswering && !isAnswerTooLong) {
        setAttemptedSend(true);
      }
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
    if (isSendKey(event, touch)) {
      event.preventDefault();
      if (isLastPage) {
        send();
      } else {
        advance();
      }
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
    if (isSendKey(event, touch)) {
      event.preventDefault();
      decline();
    }
  };

  // What the card says the agent wants. The tool's name as words — the exact
  // identifier stays in the timeline row's fold-out — plus the connector it
  // would go through, which is part of what is being consented to.
  const proposedArgs = isQuestion ? undefined : formatPayload(pending.args);
  const asker = agentName || 'The agent';
  let approvalTitle: string;
  const owner = pending.toolName ? connectorOf?.(pending.toolName) : undefined;
  if (pending.toolName) {
    approvalTitle = `${asker} wants to run “${humanizeToolName(
      owner?.tool ?? pending.toolName,
    )}”${owner ? ` on ${owner.connector}` : ''}`;
  } else {
    approvalTitle = `${asker} is asking permission to continue`;
  }

  const question = isQuestion ? pending.questions[pageIndex] : undefined;

  return (
    <form
      onSubmit={handleSubmit}
      ref={formRef}
      aria-label={isQuestion ? 'Question from the agent' : 'Permission request'}
      className={`${classes.card} ${isQuestion ? '' : classes.approvalCard}`}
      data-testid="hitl-card"
    >
      {/* What is asked stays in view while the body scrolls: who asks and,
          with several questions, where in them the reader is. */}
      {isQuestion ? (
        <div className={classes.pager}>
          <Text variant="body-small" color="secondary" weight="bold">
            {isPaged
              ? `Question ${pageIndex + 1} of ${questionCount}`
              : `${asker} asks`}
          </Text>
          {isPaged && (
            <Flex align="center" gap="1">
              <ButtonIcon
                type="button"
                size="small"
                variant="tertiary"
                aria-label="Previous question"
                icon={<ChevronLeftIcon />}
                isDisabled={pageIndex === 0 || isAnswering}
                onPress={() => setPage(pageIndex - 1)}
              />
              <ButtonIcon
                type="button"
                size="small"
                variant="tertiary"
                aria-label="Next question"
                icon={<ChevronRightIcon />}
                isDisabled={isLastPage || isAnswering}
                onPress={() => setPage(pageIndex + 1)}
              />
            </Flex>
          )}
        </div>
      ) : (
        <div className={classes.header}>
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
          <span className={classes.changesThings}>
            <EffectBadge effect="changes" />
          </span>
        </div>
      )}

      <div className={classes.body}>
        {error && (
          <Alert status="danger" title="Answer not sent" description={error} />
        )}

        {isUserScoped === false && (
          <Text variant="body-small" color="secondary">
            This kagent does not scope sessions to users, so this question may
            be meant for someone else.
          </Text>
        )}

        {question && (
          // Keyed on the question text plus its position: the text is what the
          // user reads, and the position is what makes duplicates distinct —
          // and a new key per page gives each its own fresh controls.
          <Flex
            direction="column"
            gap="2"
            key={`${pageIndex}:${question.question}`}
            className={classes.conversationText}
          >
            {/* Always printed: the card is docked while the conversation
                scrolls, so the timeline's copy of the question is often out of
                view — and with several, the pairing of choices to question is
                not otherwise recoverable. The timeline keeps its copy as the
                record of what was asked.

                Markdown, because these are written for a chat client and use
                it freely — the live examples contain bold and hard breaks. */}
            <MessageMarkdown text={question.question} />

            {question.choices &&
              (question.multiple ? (
                <CheckboxGroup
                  aria-label="Choices"
                  value={chosen[pageIndex] ?? []}
                  onChange={values => setChoices(pageIndex, values)}
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
                  value={chosen[pageIndex]?.[0] ?? null}
                  onChange={value =>
                    setChoices(pageIndex, value ? [value] : [])
                  }
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
              value={typed[pageIndex] ?? ''}
              onChange={value => setTypedAt(pageIndex, value)}
              onKeyDown={handleAnswerKeyDown}
              enterKeyHint={sendEnterKeyHint(touch)}
              isDisabled={isAnswering}
              rows={2}
            />
          </Flex>
        )}

        {/* The exact arguments Allow would run — the one place they must be
            visible, since the timeline folds its copy away. */}
        {proposedArgs && (
          <pre className={classes.proposedArgs}>{proposedArgs}</pre>
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
            enterKeyHint={sendEnterKeyHint(touch)}
            isDisabled={isAnswering}
            rows={2}
          />
        )}
      </div>

      {/* The row wraps so at phone width the buttons drop under the caption
          instead of squeezing beside it. */}
      <Flex
        align="center"
        justify={caption ? 'between' : 'end'}
        gap="2"
        style={{ flexWrap: 'wrap' }}
        className={classes.actions}
      >
        {caption && (
          <Text variant="body-small" color="secondary">
            {caption}
          </Text>
        )}
        <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
          {/* An approval only: a question cannot be rejected (see the
              component doc). */}
          {!isQuestion && (
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
          )}
          {isLastPage ? (
            <Button variant="primary" type="submit" isDisabled={isSendDisabled}>
              {submitLabel}
            </Button>
          ) : (
            // Not a submit: the answers go together, from the last page.
            <Button
              variant="primary"
              type="button"
              isDisabled={!canAdvance}
              onPress={advance}
            >
              Next
            </Button>
          )}
        </Flex>
      </Flex>
    </form>
  );
}
