import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnswerNotTakenNotice } from './AnswerNotTakenNotice';

const newSession = () => ({ onStart: jest.fn() });
const continueButton = () =>
  screen.queryByRole('button', { name: 'Continue in a new session' });

describe('AnswerNotTakenNotice', () => {
  it('says the session cannot continue, shows the answer and offers the new session in itself', async () => {
    const action = newSession();
    render(
      <AnswerNotTakenNotice
        agentName="Grill master"
        newSession={action}
        answer="Cyclists"
      />,
    );

    expect(
      screen.getByText('Could not resume this session'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /the question is still open and this session cannot continue/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Your answer: Cyclists')).toBeInTheDocument();
    expect(
      screen.getByText(
        /To carry on, continue in a new session with Grill master\. Its first message holds this conversation, with tools named but not their results, the open question and your answer\./,
      ),
    ).toBeInTheDocument();
    // Terminal: nothing suggests sending it again.
    expect(screen.queryByText(/retry|again/i)).not.toBeInTheDocument();

    await userEvent.click(continueButton()!);
    expect(action.onStart).toHaveBeenCalled();
  });

  it('says the new session gets the open question when there is no answer to carry', () => {
    // An approval's words mean nothing to a new session.
    render(
      <AnswerNotTakenNotice
        agentName="Grill master"
        newSession={newSession()}
      />,
    );

    expect(
      screen.getByText(
        /Its first message holds this conversation, with tools named but not their results, and the open question\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Your answer/)).not.toBeInTheDocument();
  });

  it('says how much of the conversation the new session gets', () => {
    const { rerender } = render(
      <AnswerNotTakenNotice
        agentName="Grill master"
        newSession={newSession()}
        answer="Cyclists"
        continuation={{ messageCount: 12, includedMessageCount: 12 }}
      />,
    );
    expect(
      screen.getByText(
        /Its first message holds this conversation \(12 messages\)/,
      ),
    ).toBeInTheDocument();

    rerender(
      <AnswerNotTakenNotice
        agentName="Grill master"
        newSession={newSession()}
        answer="Cyclists"
        continuation={{ messageCount: 52, includedMessageCount: 40 }}
      />,
    );
    expect(
      screen.getByText(
        /Its first message holds the newest 40 of this conversation's 52 messages/,
      ),
    ).toBeInTheDocument();
  });

  it('says plainly when none of the conversation fits beside the answer', () => {
    render(
      <AnswerNotTakenNotice
        agentName="Grill master"
        newSession={newSession()}
        answer="Cyclists"
        continuation={{ messageCount: 7, includedMessageCount: 0 }}
      />,
    );

    expect(
      screen.getByText(
        /Its first message holds the open question and your answer; this conversation's 7 messages do not fit beside them\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/newest 0/)).not.toBeInTheDocument();
  });

  it('names why no new session can start from this portal, and keeps the answer in sight', () => {
    render(
      <AnswerNotTakenNotice
        agentName="Grill master"
        newSessionBlocker="Muster has no per-user sign-in here."
        answer="Cyclists"
      />,
    );

    expect(
      screen.getByText(
        /A new session with Grill master cannot be started from this portal: sessions start through agent-manager as you\. Muster has no per-user sign-in here\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Your answer: Cyclists')).toBeInTheDocument();
    expect(continueButton()).not.toBeInTheDocument();
  });

  it('points to the Sessions list when the page cannot offer the new session', () => {
    render(<AnswerNotTakenNotice />);

    expect(
      screen.getByText(
        /Continue in a new session with the same agent from the Sessions list\./,
      ),
    ).toBeInTheDocument();
    expect(continueButton()).not.toBeInTheDocument();
  });

  it('reports a failed start, with the button there to try again', () => {
    render(
      <AnswerNotTakenNotice
        agentName="Grill master"
        newSession={newSession()}
        startError="kagent does not know the agent"
      />,
    );

    expect(
      screen.getByText(
        'The new session could not be started: kagent does not know the agent',
      ),
    ).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();
  });
});
