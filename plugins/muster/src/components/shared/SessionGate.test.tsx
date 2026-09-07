import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MusterSession } from '../MusterInstanceProvider/useMusterSession';
import { sessionGateCopy } from '../MusterInstanceProvider/sessionCopy';
import { SessionGate } from './SessionGate';

function session(overrides: Partial<MusterSession> = {}): MusterSession {
  return {
    authenticated: false,
    pending: false,
    connecting: false,
    connect: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const EXPIRED: MusterSession = session({
  failure: {
    kind: 'session-expired',
    message:
      'Your portal session has expired; no token could be minted for muster on golem.',
  },
});
const MINT_FAILED: MusterSession = session({
  failure: {
    kind: 'mint-failed',
    message:
      'Could not mint a token for muster on golem: Token broker is unreachable',
  },
});
const REJECTED: MusterSession = session({
  failure: {
    kind: 'muster-rejected',
    message: 'muster on golem rejected the token: Token validation failed',
  },
});
const UNREACHABLE: MusterSession = session({
  failure: {
    kind: 'unreachable',
    message:
      'muster on golem is not reachable from this portal (no answer within 3000 ms).',
  },
});

describe('SessionGate', () => {
  it('shows a neutral checking state with no button while the probe runs', () => {
    render(
      <SessionGate session={session({ pending: true })} installation="golem" />,
    );

    expect(
      screen.getByText('Checking your muster session for golem…'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers the single re-login for an expired portal session', async () => {
    const user = userEvent.setup();
    render(<SessionGate session={EXPIRED} installation="golem" />);

    expect(screen.getByText(EXPIRED.failure!.message)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(EXPIRED.connect).toHaveBeenCalledTimes(1);
  });

  it('quotes the cause and offers a retry when the mint failed', () => {
    render(<SessionGate session={MINT_FAILED} installation="golem" />);

    expect(screen.getByText(/Token broker is unreachable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it("quotes muster's message and offers a retry when muster rejected the token", () => {
    render(<SessionGate session={REJECTED} installation="golem" />);

    expect(
      screen.getByText(
        'muster on golem rejected the token: Token validation failed',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('says the muster is not reachable from this portal and offers no button', () => {
    // Nothing was tried on the person's behalf and nothing can be retried
    // from here, so a Connect button would be a dead one.
    render(<SessionGate session={UNREACHABLE} installation="golem" />);

    expect(
      screen.getByText(
        'muster on golem is not reachable from this portal (no answer within 3000 ms).',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('leads with the context sentence when given one', () => {
    render(
      <SessionGate
        session={REJECTED}
        installation="golem"
        context="Server topology is visible from the CRDs; tools need a live muster session."
      />,
    );

    expect(
      screen.getByText(
        'Server topology is visible from the CRDs; tools need a live muster session. muster on golem rejected the token: Token validation failed',
      ),
    ).toBeInTheDocument();
  });

  it('disables the action while a connect is in flight', () => {
    render(
      <SessionGate
        session={{ ...REJECTED, connecting: true }}
        installation="golem"
      />,
    );

    const button = screen.getByRole('button', { name: /Connecting/ });
    expect(button).toBeDisabled();
  });

  it.each([
    ['pending', session({ pending: true })],
    ['session-expired', EXPIRED],
    ['mint-failed', MINT_FAILED],
    ['muster-rejected', REJECTED],
    ['unreachable', UNREACHABLE],
    ['unknown', session()],
  ])('never claims a generic "not authenticated" (%s)', (_name, s) => {
    render(<SessionGate session={s} installation="golem" />);

    expect(screen.queryByText(/not authenticated/i)).toBeNull();
    expect(screen.queryByText(/Connect to muster/i)).toBeNull();
    expect(screen.queryByText(/Authenticate to muster/i)).toBeNull();
  });
});

describe('sessionGateCopy', () => {
  it('gives each failure class its own badge and action', () => {
    expect(sessionGateCopy(EXPIRED, 'golem')).toEqual({
      badge: 'Session expired',
      sentence: EXPIRED.failure!.message,
      action: 'Sign in again',
    });
    expect(sessionGateCopy(MINT_FAILED, 'golem')).toEqual({
      badge: 'No token',
      sentence: MINT_FAILED.failure!.message,
      action: 'Retry',
    });
    expect(sessionGateCopy(REJECTED, 'golem')).toEqual({
      badge: 'Rejected by muster',
      sentence: REJECTED.failure!.message,
      action: 'Retry',
    });
    expect(sessionGateCopy(UNREACHABLE, 'golem')).toEqual({
      badge: 'Not reachable',
      sentence: UNREACHABLE.failure!.message,
    });
  });

  it('has no action while checking, and a retry for an unexplained miss', () => {
    expect(sessionGateCopy(session({ pending: true }), 'golem')).toEqual({
      badge: 'Checking session…',
      sentence: 'Checking your muster session for golem…',
    });
    expect(sessionGateCopy(session(), undefined)).toEqual({
      badge: 'No session',
      sentence: 'No muster session yet.',
      action: 'Retry',
    });
  });
});
