import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PendingConfirmation } from '../../lib/kagentHitl';
import { MESSAGE_TEXT_MAX_LENGTH } from '../SessionComposer';
import { PendingConfirmationPanel } from './PendingConfirmationPanel';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react';

const onAnswer = jest.fn();

const singleChoice: PendingConfirmation = {
  taskId: 'task-1',
  asks: 'input',
  toolName: 'ask_user',
  questions: [
    {
      question: 'What is the actual goal?',
      choices: ['A sculpture', 'A rideable bike'],
      multiple: false,
    },
  ],
};

const multiChoice: PendingConfirmation = {
  taskId: 'task-1',
  asks: 'input',
  toolName: 'ask_user',
  questions: [
    {
      question: 'Which are true?',
      choices: [
        'Has an emperor',
        'Southern hemisphere',
        'Named after a flower',
      ],
      multiple: true,
    },
  ],
};

const freeText: PendingConfirmation = {
  taskId: 'task-1',
  asks: 'input',
  toolName: 'ask_user',
  questions: [{ question: 'Which cluster?', multiple: false }],
};

const approval: PendingConfirmation = {
  taskId: 'task-1',
  asks: 'approval',
  toolName: 'delete_file',
  questions: [],
};

function renderPanel(
  pending: PendingConfirmation,
  props: Partial<Parameters<typeof PendingConfirmationPanel>[0]> = {},
) {
  return render(
    <PendingConfirmationPanel
      pending={pending}
      isAnswering={false}
      onAnswer={onAnswer}
      {...props}
    />,
  );
}

const sendButton = () => screen.getByRole('button', { name: 'Send answer' });
const declineButton = () => screen.getByRole('button', { name: 'Decline' });

beforeEach(() => {
  onAnswer.mockReset();
});

describe('PendingConfirmationPanel', () => {
  describe('a single-choice question', () => {
    it('offers each choice and refuses to send until one is picked', async () => {
      renderPanel(singleChoice);

      expect(sendButton()).toBeDisabled();
      await userEvent.click(screen.getByLabelText('A rideable bike'));

      expect(sendButton()).toBeEnabled();
    });

    it('sends the choice text, naming the task it resumes', async () => {
      // The choice's own text, not its index — confirmed against live traffic.
      renderPanel(singleChoice);

      await userEvent.click(screen.getByLabelText('A rideable bike'));
      await userEvent.click(sendButton());

      expect(onAnswer).toHaveBeenCalledWith({
        taskId: 'task-1',
        decision: 'approve',
        answers: [['A rideable bike']],
        text: 'A rideable bike',
      });
    });

    it('prints the question it asks, since it stays docked while the conversation scrolls', async () => {
      // T40: the card is the live surface in the chat bar, and the timeline's
      // copy (the record) is often scrolled out of view.
      renderPanel(singleChoice, { agentName: 'Issue tracker' });

      expect(screen.getByText('What is the actual goal?')).toBeInTheDocument();
      expect(screen.getByText('Issue tracker asks')).toBeInTheDocument();
      // One question: no pager.
      expect(screen.queryByText(/Question 1 of/)).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Next question' }),
      ).toBeNull();
    });
  });

  describe('a multi-select question', () => {
    it('sends every selected choice in one answer', async () => {
      renderPanel(multiChoice);

      await userEvent.click(screen.getByLabelText('Has an emperor'));
      await userEvent.click(screen.getByLabelText('Named after a flower'));
      await userEvent.click(sendButton());

      expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          answers: [['Has an emperor', 'Named after a flower']],
        }),
      );
    });
  });

  describe('a free-text question', () => {
    it('takes prose and still sends it as a list of one', async () => {
      renderPanel(freeText);

      await userEvent.type(
        screen.getByRole('textbox', { name: 'Answer' }),
        'gazelle',
      );
      await userEvent.click(sendButton());

      expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ answers: [['gazelle']] }),
      );
    });

    it('offers no choices to pick', () => {
      renderPanel(freeText);

      expect(screen.queryByRole('radio')).toBeNull();
    });
  });

  describe('several questions at once', () => {
    const two: PendingConfirmation = {
      ...singleChoice,
      questions: [
        { question: 'First?', choices: ['a', 'b'], multiple: false },
        { question: 'Second?', choices: ['c', 'd'], multiple: false },
      ],
    };

    const nextButton = () => screen.getByRole('button', { name: 'Next' });

    it('pages through them one at a time: "Question 1 of N"', async () => {
      // A docked card has half a phone screen; a stack of choice lists would
      // push the message box off it.
      renderPanel(two);

      expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
      expect(screen.getByText('First?')).toBeInTheDocument();
      expect(screen.queryByText('Second?')).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Previous question' }),
      ).toBeDisabled();

      await userEvent.click(
        screen.getByRole('button', { name: 'Next question' }),
      );

      expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
      expect(screen.getByText('Second?')).toBeInTheDocument();
      expect(screen.queryByText('First?')).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Next question' }),
      ).toBeDisabled();
    });

    it('moves on only once the page’s question has an answer, and sends from the last', async () => {
      renderPanel(two);

      // No Send before the last page: the answers go together.
      expect(screen.queryByRole('button', { name: 'Send answer' })).toBeNull();
      expect(nextButton()).toBeDisabled();

      await userEvent.click(screen.getByLabelText('a'));
      await userEvent.click(nextButton());

      expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
      expect(sendButton()).toBeDisabled();
    });

    it('will not send until every question is answered, and says which is missing', async () => {
      // kagent treats a short entry as "not answered" rather than an error, so a
      // partial set would resume the task with a question silently dropped.
      renderPanel(two);

      await userEvent.click(
        screen.getByRole('button', { name: 'Next question' }),
      );
      await userEvent.click(screen.getByLabelText('d'));

      // Pressable: the missing answer is on another page, so pressing Send is
      // how the user finds out which.
      expect(screen.queryByText(/still needs an answer/)).toBeNull();
      await userEvent.click(sendButton());

      expect(onAnswer).not.toHaveBeenCalled();
      expect(
        screen.getByText('Question 1 still needs an answer.'),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'Previous question' }),
      );
      await userEvent.click(screen.getByLabelText('a'));
      await userEvent.click(nextButton());

      expect(sendButton()).toBeEnabled();
    });

    it('does not complain about a question on arriving at it, only after a blocked send', async () => {
      // Live round 2 (R6): "Question 2 still needs an answer." showed as soon as
      // question 2 opened. The T31 rule: no error before the first blocked attempt.
      renderPanel(two);

      await userEvent.click(screen.getByLabelText('a'));
      await userEvent.click(nextButton());

      expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
      expect(screen.queryByText(/still needs an answer/)).toBeNull();
      // The question in view is the unanswered one: a disabled Send says enough.
      expect(sendButton()).toBeDisabled();

      // Enter from the unanswered page is a blocked attempt.
      await userEvent.click(screen.getByRole('textbox', { name: 'Answer' }));
      await userEvent.keyboard('{Enter}');

      expect(onAnswer).not.toHaveBeenCalled();
      expect(
        screen.getByText('Question 2 still needs an answer.'),
      ).toBeInTheDocument();
    });

    it('keeps each page’s answer while paging, and sends them positionally', async () => {
      renderPanel(two);

      await userEvent.click(screen.getByLabelText('b'));
      await userEvent.click(nextButton());
      await userEvent.click(screen.getByLabelText('c'));
      await userEvent.click(
        screen.getByRole('button', { name: 'Previous question' }),
      );
      expect(screen.getByLabelText('b')).toBeChecked();
      await userEvent.click(nextButton());
      await userEvent.click(sendButton());

      expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ answers: [['b'], ['c']] }),
      );
    });

    it('moves to the next question on Enter, and sends on Enter from the last', async () => {
      renderPanel(two);

      screen.getByLabelText('a').focus();
      await userEvent.keyboard(' ');
      await userEvent.keyboard('{Enter}');

      expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
      // The focus followed the page: the new question's first choice.
      expect(screen.getByLabelText('c')).toHaveFocus();
      expect(onAnswer).not.toHaveBeenCalled();

      await userEvent.keyboard(' ');
      await userEvent.keyboard('{Enter}');

      expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ answers: [['a'], ['c']] }),
      );
    });

    it('starts again at the first page when a follow-up replaces the questions', async () => {
      const { rerender } = renderPanel(two);
      await userEvent.click(
        screen.getByRole('button', { name: 'Next question' }),
      );

      rerender(
        <PendingConfirmationPanel
          pending={{
            ...two,
            questions: [
              { question: 'Third?', choices: ['e'], multiple: false },
              { question: 'Fourth?', choices: ['f'], multiple: false },
            ],
          }}
          isAnswering={false}
          onAnswer={onAnswer}
        />,
      );

      expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
      expect(screen.getByText('Third?')).toBeInTheDocument();
    });
  });

  describe('an approval', () => {
    it('renders the permission card: who asks, for what, Allow and Decline', () => {
      renderPanel(approval, { agentName: 'Support Triage' });

      // The tool's name as words — the exact identifier stays in the
      // timeline's technical view.
      expect(
        screen.getByText('Support Triage wants to run “Delete file”'),
      ).toBeInTheDocument();
      // The prototype's reassurance, under the title — and no resting caption
      // beside the buttons repeating what a decision does.
      expect(
        screen.getByText('Nothing is sent until you allow it.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/resumes the agent where it stopped/),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Allow' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Decline' }),
      ).toBeInTheDocument();
    });

    it('carries the "changes things" accent — the reason the card interrupts', () => {
      renderPanel(approval);

      expect(screen.getByText('Changes things')).toBeInTheDocument();
    });

    it('says who is asking even when no agent name is known', () => {
      renderPanel(approval);

      expect(
        screen.getByText('The agent wants to run “Delete file”'),
      ).toBeInTheDocument();
    });

    it('shows the connector the proposed call would go through', () => {
      renderPanel({ ...approval, via: 'Muster' });

      expect(
        screen.getByText('The agent wants to run “Delete file” via Muster'),
      ).toBeInTheDocument();
    });

    it('shows the exact arguments Allow would run', () => {
      renderPanel({ ...approval, args: { path: '/tmp/x', recursive: true } });

      expect(screen.getByText(/"path": "\/tmp\/x"/)).toBeInTheDocument();
      expect(screen.getByText(/"recursive": true/)).toBeInTheDocument();
    });

    it('allows with no answers attached', async () => {
      renderPanel(approval);

      await userEvent.click(screen.getByRole('button', { name: 'Allow' }));

      expect(onAnswer).toHaveBeenCalledWith({
        taskId: 'task-1',
        decision: 'approve',
      });
    });
  });

  describe('declining', () => {
    it.each([
      ['a single-choice question', singleChoice],
      ['a multi-select question', multiChoice],
      ['a free-text question', freeText],
    ])('is not offered on %s, which cannot be rejected', (_, pending) => {
      // Live round 2 (R1): the backend refuses a rejected ask_user ("A question
      // cannot be rejected; answer it, or leave the session waiting"), so Decline
      // on a question always failed. Answering is the only way through.
      renderPanel(pending);

      expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Confirm decline' }),
      ).toBeNull();
      expect(sendButton()).toBeInTheDocument();
    });

    it('asks for a reason before it takes the refusal', async () => {
      // Two steps on purpose: a refusal resumes the agent as surely as an answer
      // does, and the reason is the only thing that reaches it.
      renderPanel(approval);

      await userEvent.click(declineButton());

      expect(onAnswer).not.toHaveBeenCalled();
      expect(
        screen.getByRole('textbox', { name: /Reason/ }),
      ).toBeInTheDocument();
    });

    it('sends a refusal carrying the reason', async () => {
      renderPanel(approval);

      await userEvent.click(declineButton());
      await userEvent.type(
        screen.getByRole('textbox', { name: /Reason/ }),
        'none of these',
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Confirm decline' }),
      );

      expect(onAnswer).toHaveBeenCalledWith({
        taskId: 'task-1',
        decision: 'reject',
        rejectionReason: 'none of these',
        text: 'none of these',
      });
    });

    it('allows a refusal with no reason at all', async () => {
      renderPanel(approval);

      await userEvent.click(declineButton());
      await userEvent.click(
        screen.getByRole('button', { name: 'Confirm decline' }),
      );

      expect(onAnswer).toHaveBeenCalledWith({
        taskId: 'task-1',
        decision: 'reject',
      });
    });
  });

  describe('while an answer is in flight', () => {
    it('says so and refuses a second submission', () => {
      renderPanel(singleChoice, { isAnswering: true });

      expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    });
  });

  it('shows a failed answer and puts the words back', () => {
    // Restored into the free-text box rather than onto the choices: a failed
    // answer's values are plain strings, and which were clicked and which were
    // typed is not recoverable from the wire form. This keeps every word.
    renderPanel(singleChoice, {
      error: 'kagent refused the answer',
      restore: {
        messageId: 'msg-1',
        taskId: 'task-1',
        decision: 'approve',
        answers: [['A rideable bike']],
      },
    });

    expect(screen.getByText('Answer not sent')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveValue(
      'A rideable bike',
    );
  });

  describe('answering in your own words', () => {
    it('offers a text box beside a choice list, since choices are not exhaustive', () => {
      // The live examples end in "Something else (I'll explain)", and typed words
      // do reach the agent — they go into the `answer` array, not the text part.
      renderPanel(singleChoice);

      expect(
        screen.getByPlaceholderText('Or type your own answer…'),
      ).toBeInTheDocument();
    });

    it('sends typed words as the answer when no choice is picked', async () => {
      renderPanel(singleChoice);

      await userEvent.type(
        screen.getByRole('textbox', { name: 'Answer' }),
        'a cardboard unicycle',
      );
      await userEvent.click(sendButton());

      expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ answers: [['a cardboard unicycle']] }),
      );
    });

    it('sends a choice and typed words together, choices first', async () => {
      // Not alternatives: `answer` is a list, so "I picked this *and* here is why"
      // is representable and worth keeping.
      renderPanel(singleChoice);

      await userEvent.click(screen.getByLabelText('A rideable bike'));
      await userEvent.type(
        screen.getByRole('textbox', { name: 'Answer' }),
        'but keep it under 10kg',
      );
      await userEvent.click(sendButton());

      expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          answers: [['A rideable bike', 'but keep it under 10kg']],
        }),
      );
    });

    it('counts typed words as answering the question', async () => {
      renderPanel(singleChoice);

      expect(sendButton()).toBeDisabled();
      await userEvent.type(
        screen.getByRole('textbox', { name: 'Answer' }),
        'something else entirely',
      );

      expect(sendButton()).toBeEnabled();
    });

    it('ignores whitespace-only words', async () => {
      renderPanel(singleChoice);

      await userEvent.type(
        screen.getByRole('textbox', { name: 'Answer' }),
        '   ',
      );

      expect(sendButton()).toBeDisabled();
    });
  });

  describe('when the agent asks a follow-up', () => {
    // Same task id on purpose: answering *resumes* the task, so a task that
    // suspends again to ask the next question keeps its id. Keying a reset on the
    // id would therefore not fire here.
    const followUp: PendingConfirmation = {
      taskId: 'task-1',
      asks: 'input',
      toolName: 'ask_user',
      questions: [
        {
          question: 'Delete the namespace?',
          choices: ['yes', 'no'],
          multiple: false,
        },
      ],
    };

    function rerenderWith(
      pending: PendingConfirmation,
      rerender: ReturnType<typeof renderPanel>['rerender'],
    ) {
      rerender(
        <PendingConfirmationPanel
          pending={pending}
          isAnswering={false}
          onAnswer={onAnswer}
        />,
      );
    }

    it('clears the previous answer instead of carrying it into the new question', async () => {
      // The panel does not unmount between two consecutive confirmations —
      // `bottomControl` renders the same element type throughout, so React
      // reconciles. Without a reset the old answer survives: it matches none of the
      // new choices so nothing looks selected, yet the question counts as answered
      // and Send would submit the *previous* answer against the *new* question.
      const { rerender } = renderPanel(singleChoice);
      await userEvent.click(screen.getByLabelText('A rideable bike'));
      expect(sendButton()).toBeEnabled();

      rerenderWith(followUp, rerender);

      expect(sendButton()).toBeDisabled();
    });

    it('clears typed words too', async () => {
      const { rerender } = renderPanel(singleChoice);
      await userEvent.type(
        screen.getByRole('textbox', { name: 'Answer' }),
        'a cardboard unicycle',
      );

      rerenderWith(followUp, rerender);

      expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveValue('');
    });

    it('answers the new question, not the old one', async () => {
      const { rerender } = renderPanel(singleChoice);
      await userEvent.click(screen.getByLabelText('A rideable bike'));
      rerenderWith(followUp, rerender);

      await userEvent.click(screen.getByLabelText('no'));
      await userEvent.click(sendButton());

      expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ answers: [['no']] }),
      );
    });

    it('does not restore a failed attempt from the previous question', async () => {
      // `confirmation.failed` outlives the question it belonged to, so a reset has
      // to treat any outstanding restore as already consumed.
      const { rerender } = renderPanel(singleChoice);

      rerender(
        <PendingConfirmationPanel
          pending={followUp}
          isAnswering={false}
          onAnswer={onAnswer}
          restore={{
            messageId: 'msg-old',
            taskId: 'task-1',
            decision: 'approve',
            answers: [['A rideable bike']],
          }}
        />,
      );

      expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveValue('');
    });
  });

  it('restores a failed attempt that arrives after mount', async () => {
    // The runtime path, and the one the original seeding missed: `restore` is
    // `confirmation.failed`, which is null at mount and only becomes set once an
    // attempt has failed — with the panel still mounted throughout. A `useState`
    // initializer therefore never saw it.
    const { rerender } = renderPanel(singleChoice);
    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveValue('');

    rerender(
      <PendingConfirmationPanel
        pending={singleChoice}
        isAnswering={false}
        onAnswer={onAnswer}
        error="kagent refused the answer"
        restore={{
          messageId: 'msg-1',
          taskId: 'task-1',
          decision: 'approve',
          answers: [['A rideable bike']],
        }}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveValue(
      'A rideable bike',
    );
  });

  it('does not double the answer when restoring a failed attempt', async () => {
    // `restore` is the *submitted payload*, so each entry already holds the picked
    // options followed by the typed words — and the panel stayed mounted across the
    // failure, so `chosen` still holds that same selection. Seeding only `typed`
    // therefore fed every choice in twice.
    //
    // A rerender, not a fresh mount: mounting fresh leaves `chosen` empty, which is
    // the one arrangement in which restoring only `typed` happens to be correct.
    const { rerender } = renderPanel(singleChoice);
    await userEvent.click(screen.getByLabelText('A rideable bike'));
    await userEvent.click(sendButton());

    const submitted = onAnswer.mock.calls[0][0];
    expect(submitted.answers).toEqual([['A rideable bike']]);

    rerender(
      <PendingConfirmationPanel
        pending={singleChoice}
        isAnswering={false}
        onAnswer={onAnswer}
        error="kagent refused the answer"
        restore={{ messageId: 'msg-1', ...submitted }}
      />,
    );

    // The whole previous answer now lives in the text box, and nothing is left
    // selected to be added to it a second time.
    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveValue(
      'A rideable bike',
    );
    expect(screen.getByLabelText('A rideable bike')).not.toBeChecked();

    onAnswer.mockClear();
    await userEvent.click(sendButton());

    expect(onAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ answers: [['A rideable bike']] }),
    );
  });

  it('will not offer a decline it would silently drop', async () => {
    // `decline()` early-returns on an over-long reason. Leaving the button enabled
    // made pressing it do nothing, with only the caption to explain — and an
    // over-long *answer* outranks the reason there, so that explanation can be
    // hidden exactly when it is needed.
    renderPanel(approval);

    await userEvent.click(declineButton());
    await userEvent.click(screen.getByRole('textbox', { name: /Reason/ }));
    await userEvent.paste('x'.repeat(MESSAGE_TEXT_MAX_LENGTH + 1));

    expect(
      screen.getByRole('button', { name: 'Confirm decline' }),
    ).toBeDisabled();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('refuses an answer over the message limit and says how long it is', async () => {
    // Sent as the message's `text`, which the route rejects above the same limit —
    // so without an up-front bound this came back as a raw validator message for a
    // limit the panel never mentioned.
    renderPanel(freeText);

    await userEvent.click(screen.getByRole('textbox', { name: 'Answer' }));
    await userEvent.paste('x'.repeat(MESSAGE_TEXT_MAX_LENGTH + 1));

    expect(sendButton()).toBeDisabled();
    expect(
      screen.getByText(
        `That answer is ${MESSAGE_TEXT_MAX_LENGTH + 1} characters; the limit is ${MESSAGE_TEXT_MAX_LENGTH}.`,
      ),
    ).toBeInTheDocument();
  });

  describe('from the keyboard', () => {
    // Reported by the first colleague to try the chat: the answer could only be
    // sent by reaching the button with the mouse or Tab. A textarea never submits
    // its form on Enter, and whether a focused radio does is browser-specific.
    it('sends the typed answer on Enter', async () => {
      renderPanel(freeText);

      await userEvent.type(
        screen.getByRole('textbox', { name: 'Answer' }),
        'gazelle{Enter}',
      );

      expect(onAnswer).toHaveBeenCalledTimes(1);
      expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1', answers: [['gazelle']] }),
      );
    });

    it('breaks the line on Shift+Enter', async () => {
      renderPanel(freeText);

      const box = screen.getByRole('textbox', { name: 'Answer' });
      await userEvent.type(box, 'line one{Shift>}{Enter}{/Shift}line two');

      expect(onAnswer).not.toHaveBeenCalled();
      expect(box).toHaveValue('line one\nline two');
    });

    it('sends the chosen option on Enter from a radio', async () => {
      renderPanel(singleChoice);

      await userEvent.click(screen.getByRole('radio', { name: 'A sculpture' }));
      await userEvent.keyboard('{Enter}');

      // Exactly once: the browser's own Enter-submits-the-form must not fire on
      // top of ours.
      expect(onAnswer).toHaveBeenCalledTimes(1);
      expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ answers: [['A sculpture']] }),
      );
    });

    it('sends the chosen options on Enter from a checkbox', async () => {
      renderPanel(multiChoice);

      await userEvent.click(
        screen.getByRole('checkbox', { name: 'Has an emperor' }),
      );
      await userEvent.click(
        screen.getByRole('checkbox', { name: 'Named after a flower' }),
      );
      await userEvent.keyboard('{Enter}');

      expect(onAnswer).toHaveBeenCalledTimes(1);
      expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          answers: [['Has an emperor', 'Named after a flower']],
        }),
      );
    });

    it('does nothing on Enter with the question unanswered — no newline either', async () => {
      renderPanel(singleChoice);

      const box = screen.getByRole('textbox', { name: 'Answer' });
      await userEvent.type(box, '{Enter}');

      expect(onAnswer).not.toHaveBeenCalled();
      expect(box).toHaveValue('');
    });

    it('confirms the decline on Enter in the reason box, never an approval', async () => {
      // The box only exists because Decline was pressed; a form submit from here
      // would Allow the call — the opposite of what the user is in the middle of.
      renderPanel(approval);

      await userEvent.click(declineButton());
      await userEvent.type(
        screen.getByRole('textbox', { name: /Reason/ }),
        'none of these{Enter}',
      );

      expect(onAnswer).toHaveBeenCalledTimes(1);
      expect(onAnswer).toHaveBeenCalledWith({
        taskId: 'task-1',
        decision: 'reject',
        rejectionReason: 'none of these',
        text: 'none of these',
      });
    });
  });

  describe('focus', () => {
    // The composer below is disabled while a question stands, so without this the
    // focus fell to <body> and answering started with a click or a Tab hunt.
    it('goes to the first choice when a question appears', () => {
      renderPanel(singleChoice);

      expect(screen.getByRole('radio', { name: 'A sculpture' })).toHaveFocus();
    });

    it('goes to the first checkbox of a multi-select question', () => {
      renderPanel(multiChoice);

      expect(
        screen.getByRole('checkbox', { name: 'Has an emperor' }),
      ).toHaveFocus();
    });

    it('goes to the answer box when there are no choices', () => {
      renderPanel(freeText);

      expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveFocus();
    });

    it('is not taken by an approval, whose only controls decide a tool call', () => {
      // A stray Enter on a focused Allow would grant a side-effecting call.
      renderPanel(approval);

      expect(document.body).toHaveFocus();
    });

    it('moves to the new question when a follow-up replaces the answered one', async () => {
      const { rerender } = renderPanel(singleChoice);
      await userEvent.click(screen.getByLabelText('A rideable bike'));
      await userEvent.tab();
      expect(
        screen.getByRole('radio', { name: 'A rideable bike' }),
      ).not.toHaveFocus();

      rerender(
        <PendingConfirmationPanel
          pending={{
            ...singleChoice,
            questions: [
              {
                question: 'Delete the namespace?',
                choices: ['yes', 'no'],
                multiple: false,
              },
            ],
          }}
          isAnswering={false}
          onAnswer={onAnswer}
        />,
      );

      expect(screen.getByRole('radio', { name: 'yes' })).toHaveFocus();
    });
  });

  it('warns when the question may not have been put to this user', () => {
    renderPanel(singleChoice, { isUserScoped: false });

    expect(
      screen.getByText(/may be\s+meant for someone else/),
    ).toBeInTheDocument();
  });
});

describe('PendingConfirmationPanel on a phone (T22 B2, B21)', () => {
  let layout: MockedLayout;
  afterEach(() => layout.restore());

  const injectedCss = () =>
    Array.from(document.querySelectorAll('style'))
      .map(style => style.textContent ?? '')
      .join('\n');
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /** The declarations of `element`'s class whose name contains `name`, under the phone query. */
  const phoneRule = (element: Element, name: string) => {
    const className = [...element.classList].find(each => each.includes(name))!;
    return new RegExp(
      `@media \\(max-width: 599\\.95px\\) \\{\\s*\\.${escape(
        className,
      )} \\{([^}]*)\\}`,
    ).exec(injectedCss())?.[1];
  };

  it('breaks the line on Enter with touch input, and sends from the button', async () => {
    layout = mockPhoneLayout();
    renderPanel(freeText);

    const box = screen.getByRole('textbox', { name: 'Answer' });
    await userEvent.type(box, 'line one{Enter}line two');
    expect(onAnswer).not.toHaveBeenCalled();
    expect(box).toHaveValue('line one\nline two');
    expect(box).toHaveAttribute('enterkeyhint', 'enter');
    expect(
      screen.getByText(
        'Answering resumes the agent where it stopped. Tap Send answer to send it.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(sendButton());
    expect(onAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ answers: [['line one\nline two']] }),
    );
  });

  it('names Next, not Enter, between paged questions on touch', () => {
    layout = mockPhoneLayout();
    renderPanel({
      ...freeText,
      questions: [
        { question: 'Which cluster?', multiple: false },
        { question: 'Which namespace?', multiple: false },
      ],
    });

    expect(screen.getByText('Tap Next to go on.')).toBeInTheDocument();
  });

  it('keeps the keyboard captions on a desktop', () => {
    layout = mockDesktopLayout();
    renderPanel(freeText);

    expect(
      screen.getByText(
        'Answering resumes the agent where it stopped. Enter sends, Shift+Enter for a new line.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Answer' })).toHaveAttribute(
      'enterkeyhint',
      'send',
    );
  });

  it('gives the card one scroller at phone width: arguments flow in its body', () => {
    layout = mockPhoneLayout();
    renderPanel({ ...approval, args: { path: '/etc/hosts' } });

    const card = screen.getByTestId('hitl-card');
    expect(phoneRule(card, 'card')).toMatch(
      /max-height: min\(50dvh, calc\(100dvh - var\(--agent-shell-mobile-bar-height, 0px\) - 200px\)\);/,
    );
    const args = card.querySelector('pre')!;
    expect(phoneRule(args, 'proposedArgs')).toMatch(/max-height: none;/);
  });
});
