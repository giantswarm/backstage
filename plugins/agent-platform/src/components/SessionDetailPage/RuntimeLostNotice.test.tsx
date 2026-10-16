import { render, screen } from '@testing-library/react';
import { RuntimeLostNotice } from './RuntimeLostNotice';

const ATENET =
  'actor "ai-01a09e86-0da0-764b-87b1-ac52875d1e74" request timed out';

describe('RuntimeLostNotice', () => {
  it('explains a suspected loss in the portal’s words, with the retry still open', () => {
    render(
      <RuntimeLostNotice
        loss={{ reported: false, cause: ATENET, attempts: 1 }}
        agentName="Grill master"
        offersNewSession
      />,
    );

    expect(
      screen.getByText('The agent’s runtime could not be brought back'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/could not restart the runtime holding this session/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The transcript above is complete/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Send again to retry\. If it fails again, choose Continue in a new session under the message box\./,
      ),
    ).toBeInTheDocument();
  });

  it('shows the runtime’s words as the evidence, never as the whole text', () => {
    render(
      <RuntimeLostNotice
        loss={{ reported: false, cause: ATENET, attempts: 1 }}
        agentName="Grill master"
        offersNewSession
      />,
    );

    const cause = screen.getByText(/kagent reported:/);
    expect(cause).toHaveTextContent(ATENET);
    // The raw text sits in its own line under the explanation.
    expect(cause.textContent).toBe(`kagent reported: ${ATENET}`);
  });

  it('counts repeated attempts', () => {
    render(
      <RuntimeLostNotice
        loss={{ reported: false, cause: ATENET, attempts: 3 }}
        offersNewSession
      />,
    );

    expect(
      screen.getByText(/It has failed 3 times in a row/),
    ).toBeInTheDocument();
  });

  it('is final once kagent has reported the loss', () => {
    render(
      <RuntimeLostNotice
        loss={{
          reported: true,
          cause: 'node ip-10-0-159-226 is gone',
          attempts: 2,
        }}
        agentName="Grill master"
        offersNewSession
      />,
    );

    expect(
      screen.getByText('This session cannot continue'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/kagent marked this session’s runtime as lost/),
    ).toBeInTheDocument();
    // No retry on offer: a send fails the same way every time.
    expect(screen.queryByText(/send again/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /To carry on with Grill master, choose Continue in a new session under the message box\. Its first message holds this conversation, with tools named but not their results, and the text in the box\./,
      ),
    ).toBeInTheDocument();
  });

  it('says what the new session starts with', () => {
    const { rerender } = render(
      <RuntimeLostNotice
        loss={{ reported: true, attempts: 1 }}
        agentName="Grill master"
        offersNewSession
        continuation={{ messageCount: 12, includedMessageCount: 12 }}
      />,
    );
    expect(
      screen.getByText(
        /Its first message holds this conversation \(12 messages\), with tools named but not their results, and the text in the box\./,
      ),
    ).toBeInTheDocument();

    rerender(
      <RuntimeLostNotice
        loss={{ reported: true, attempts: 1 }}
        agentName="Grill master"
        offersNewSession
        hasQuestion
        continuation={{ messageCount: 52, includedMessageCount: 40 }}
      />,
    );
    expect(
      screen.getByText(
        /Its first message holds the newest 40 of this conversation's 52 messages, with tools named but not their results, the open question and the text in the box\./,
      ),
    ).toBeInTheDocument();
  });

  it('shows the answer the lost runtime never took, which the new session carries', () => {
    render(
      <RuntimeLostNotice
        loss={{ reported: true, attempts: 1 }}
        agentName="Grill master"
        offersNewSession
        hasQuestion
        answer="Cyclists"
      />,
    );

    expect(screen.getByText('Your answer: Cyclists')).toBeInTheDocument();
    expect(
      screen.getByText(
        /the open question and your answer; text in the box replaces the answer\./,
      ),
    ).toBeInTheDocument();
  });

  it('points at the Sessions list when no new session can be offered here', () => {
    render(
      <RuntimeLostNotice
        loss={{ reported: true, attempts: 0 }}
        offersNewSession={false}
      />,
    );

    expect(
      screen.getByText(
        /Continue in a new session with the same agent from the Sessions list/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/kagent reported:/)).not.toBeInTheDocument();
  });

  it('names why no new session can start from this portal', () => {
    render(
      <RuntimeLostNotice
        loss={{ reported: true, attempts: 1 }}
        agentName="Grill master"
        offersNewSession={false}
        newSessionBlocker="Muster on gazelle has no per-user sign-in in this portal."
      />,
    );

    expect(
      screen.getByText(
        /A new session with Grill master cannot be started from this portal: sessions start through agent-manager as you\. Muster on gazelle has no per-user sign-in in this portal\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Sessions list/)).not.toBeInTheDocument();
  });

  it('reports a failed start', () => {
    render(
      <RuntimeLostNotice
        loss={{ reported: true, attempts: 1 }}
        agentName="Grill master"
        offersNewSession
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
