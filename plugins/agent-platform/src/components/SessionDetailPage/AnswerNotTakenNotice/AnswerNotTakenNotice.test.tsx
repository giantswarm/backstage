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
        /Start a new session with Grill master from the message box below to carry on; with the box left empty, it opens on your answer\./,
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
        /Start a new session with Grill master from the message box below to carry on\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Your answer/)).not.toBeInTheDocument();
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
