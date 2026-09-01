import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PendingConfirmation } from '../../lib/kagentHitl';
import { MESSAGE_TEXT_MAX_LENGTH } from '../SessionComposer';
import { PendingConfirmationPanel } from './PendingConfirmationPanel';

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

    it('does not repeat the question the timeline already shows', async () => {
      // One question renders directly above this panel as prose in the
      // conversation; printing it again put the same paragraph on screen twice.
      renderPanel(singleChoice);

      expect(screen.queryByText('What is the actual goal?')).toBeNull();
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

    it('names each question, since the pairing is not otherwise recoverable', () => {
      renderPanel(two);

      expect(screen.getByText('First?')).toBeInTheDocument();
      expect(screen.getByText('Second?')).toBeInTheDocument();
    });

    it('will not send until every question is answered', async () => {
      // kagent treats a short entry as "not answered" rather than an error, so a
      // partial set would resume the task with a question silently dropped.
      renderPanel(two);

      await userEvent.click(screen.getByLabelText('a'));
      expect(sendButton()).toBeDisabled();

      await userEvent.click(screen.getByLabelText('d'));
      expect(sendButton()).toBeEnabled();
    });

    it('keeps the answers positional', async () => {
      renderPanel(two);

      await userEvent.click(screen.getByLabelText('b'));
      await userEvent.click(screen.getByLabelText('c'));
      await userEvent.click(sendButton());

      expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ answers: [['b'], ['c']] }),
      );
    });
  });

  describe('an approval', () => {
    it('names the tool and asks for a yes rather than an answer', () => {
      renderPanel(approval);

      expect(
        screen.getByText('The agent is asking permission to run delete_file.'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Approve' }),
      ).toBeInTheDocument();
    });

    it('approves with no answers attached', async () => {
      renderPanel(approval);

      await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

      expect(onAnswer).toHaveBeenCalledWith({
        taskId: 'task-1',
        decision: 'approve',
      });
    });
  });

  describe('declining', () => {
    it('asks for a reason before it takes the refusal', async () => {
      // Two steps on purpose: a refusal resumes the agent as surely as an answer
      // does, and the reason is the only thing that reaches it.
      renderPanel(singleChoice);

      await userEvent.click(declineButton());

      expect(onAnswer).not.toHaveBeenCalled();
      expect(
        screen.getByRole('textbox', { name: /Reason/ }),
      ).toBeInTheDocument();
    });

    it('sends a refusal carrying the reason', async () => {
      renderPanel(singleChoice);

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
      renderPanel(singleChoice);

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
    renderPanel(freeText);

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

  it('warns when the question may not have been put to this user', () => {
    renderPanel(singleChoice, { isUserScoped: false });

    expect(
      screen.getByText(/may have been put to somebody else/),
    ).toBeInTheDocument();
  });
});
