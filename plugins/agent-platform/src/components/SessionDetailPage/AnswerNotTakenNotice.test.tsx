import { render, screen } from '@testing-library/react';
import { AnswerNotTakenNotice } from './AnswerNotTakenNotice';

describe('AnswerNotTakenNotice', () => {
  it('says the session cannot continue and points at the answer in the box', () => {
    render(
      <AnswerNotTakenNotice
        agentName="Grill master"
        offersNewSession
        hasDraft
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
    expect(
      screen.getByText(
        /Your answer is in the message box below\. Start a new session with Grill master from there/,
      ),
    ).toBeInTheDocument();
    // Terminal: nothing suggests sending it again.
    expect(screen.queryByText(/retry|again/i)).not.toBeInTheDocument();
  });

  it('offers the new session without a draft when the answer had no words', () => {
    // An approval carries no text to put in the box.
    render(
      <AnswerNotTakenNotice
        agentName="Grill master"
        offersNewSession
        hasDraft={false}
      />,
    );

    expect(
      screen.getByText(
        /Start a new session with Grill master from the message box below to carry on\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Your answer is in/)).not.toBeInTheDocument();
  });

  it('names why no new session can start from this portal', () => {
    render(
      <AnswerNotTakenNotice
        agentName="Grill master"
        offersNewSession={false}
        newSessionBlocker="Muster has no per-user sign-in here."
        hasDraft
      />,
    );

    expect(
      screen.getByText(
        /A new session with Grill master cannot be started from this portal: sessions start through agent-manager as you\. Muster has no per-user sign-in here\./,
      ),
    ).toBeInTheDocument();
  });

  it('points to the Sessions list when the page cannot offer the new session', () => {
    render(<AnswerNotTakenNotice offersNewSession={false} hasDraft />);

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
        hasDraft
        startError="kagent does not know the agent"
      />,
    );

    expect(
      screen.getByText(
        /The new session could not be started: kagent does not know the agent/,
      ),
    ).toBeInTheDocument();
  });
});
