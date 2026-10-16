import { render, screen } from '@testing-library/react';
import { AnswerNotTakenNotice } from './AnswerNotTakenNotice';

describe('AnswerNotTakenNotice', () => {
  it('says the session cannot continue, shows the answer and offers the new session', () => {
    render(
      <AnswerNotTakenNotice
        agentName="Grill master"
        offersNewSession
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
        /To carry on with Grill master, choose Continue in a new session under the message box\. Its first message holds this conversation, with tools named but not their results, the open question and your answer; text in the box replaces the answer\./,
      ),
    ).toBeInTheDocument();
    // Terminal: nothing suggests sending it again.
    expect(screen.queryByText(/retry|again/i)).not.toBeInTheDocument();
  });

  it('offers the new session without the answer when there is none to carry', () => {
    // An approval's words mean nothing to a new session.
    render(<AnswerNotTakenNotice agentName="Grill master" offersNewSession />);

    expect(
      screen.getByText(
        /under the message box\. Its first message holds this conversation, with tools named but not their results, the open question and the text in the box\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Your answer/)).not.toBeInTheDocument();
  });

  it('says how much of the conversation the new session gets', () => {
    const { rerender } = render(
      <AnswerNotTakenNotice
        agentName="Grill master"
        offersNewSession
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
        offersNewSession
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
        offersNewSession
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
        offersNewSession={false}
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
  });

  it('points to the Sessions list when the page cannot offer the new session', () => {
    render(<AnswerNotTakenNotice offersNewSession={false} />);

    expect(
      screen.getByText(
        /Continue in a new session with the same agent from the Sessions list\./,
      ),
    ).toBeInTheDocument();
  });

  it('reports a failed start', () => {
    render(
      <AnswerNotTakenNotice
        agentName="Grill master"
        offersNewSession
        startError="kagent does not know the agent"
      />,
    );

    expect(
      screen.getByText(
        'The new session could not be started: kagent does not know the agent',
      ),
    ).toBeInTheDocument();
  });
});
