import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PendingConfirmation } from '../../lib/kagentHitl';
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

  it('warns when the question may not have been put to this user', () => {
    renderPanel(singleChoice, { isUserScoped: false });

    expect(
      screen.getByText(/may have been put to somebody else/),
    ).toBeInTheDocument();
  });
});
