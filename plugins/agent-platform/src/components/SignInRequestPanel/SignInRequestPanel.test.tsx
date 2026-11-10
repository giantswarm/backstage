import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { externalUrlConsentApiRef } from '@giantswarm/backstage-plugin-ui-react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PendingConfirmation } from '../../lib/kagentHitl';
import { SignInRequestPanel } from './SignInRequestPanel';

const SIGN_IN: PendingConfirmation = {
  taskId: 'task-1',
  asks: 'sign-in',
  questions: [],
  signIn: {
    id: 'sign-in-1',
    server: 'muster',
    message: 'Sign in to github to continue.',
    url: 'https://muster.example.com/oauth/proxy/start?state=abc',
  },
  askedIn: 'status-1',
};

/** The person's answer in the external URL consent dialog. */
const consentOpen = jest.fn();

function withConsent(children: JSX.Element) {
  return (
    <TestApiProvider apis={[[externalUrlConsentApiRef, { open: consentOpen }]]}>
      {children}
    </TestApiProvider>
  );
}

describe('SignInRequestPanel', () => {
  beforeEach(() => {
    consentOpen.mockReset().mockResolvedValue('accept');
  });

  it('outside a session, asks before opening the sign-in and lets the person say when they are done', async () => {
    const onAnswer = jest.fn();
    const user = userEvent.setup();
    await renderInTestApp(
      withConsent(
        <SignInRequestPanel
          pending={SIGN_IN}
          isAnswering={false}
          onAnswer={onAnswer}
        />,
      ),
    );

    await user.click(
      screen.getByRole('button', { name: 'Sign in (opens in a new tab)' }),
    );
    expect(consentOpen).toHaveBeenCalledWith({
      url: SIGN_IN.signIn!.url,
      requester: 'muster',
      message: 'Sign in to github to continue.',
    });
    await user.click(screen.getByRole('button', { name: "I've signed in" }));
    expect(onAnswer).toHaveBeenLastCalledWith({
      taskId: 'task-1',
      decision: 'approve',
      text: "I've signed in.",
      askedIn: 'status-1',
    });
  });

  it('declines with Not now', async () => {
    const onAnswer = jest.fn();
    const user = userEvent.setup();
    await renderInTestApp(
      withConsent(
        <SignInRequestPanel
          pending={SIGN_IN}
          isAnswering={false}
          onAnswer={onAnswer}
        />,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onAnswer).toHaveBeenLastCalledWith({
      taskId: 'task-1',
      decision: 'reject',
      text: 'Not now.',
      askedIn: 'status-1',
    });
  });

  it('shows an answer that was not taken', async () => {
    await renderInTestApp(
      withConsent(
        <SignInRequestPanel
          pending={SIGN_IN}
          isAnswering={false}
          error="The agent is not waiting for a decision"
          onAnswer={jest.fn()}
        />,
      ),
    );

    expect(
      screen.getByText('The agent is not waiting for a decision'),
    ).toBeInTheDocument();
  });
});
