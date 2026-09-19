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
      screen.getByText(/could not restart the runtime that held this session/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/nothing is missing from the transcript/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /You can send again to retry.*start a new session with Grill master/,
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
      screen.getByText(/kagent has marked this session’s runtime as lost/),
    ).toBeInTheDocument();
    // No retry on offer: a send fails the same way every time.
    expect(screen.queryByText(/send again/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /start a new session with Grill master — the button under the message box/,
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
        /continued in a new session with the same agent from the Sessions list/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/kagent reported:/)).not.toBeInTheDocument();
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
