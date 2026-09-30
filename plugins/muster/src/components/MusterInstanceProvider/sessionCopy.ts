import type { MusterSession } from './useMusterSession';

export type SessionGateCopy = {
  /** Full sentence explaining the state, quoting the failure's message. */
  sentence: string;
  /** Label of the action that can fix the state; absent while checking. */
  action?: string;
};

/**
 * One wording per session state, shared by every gate so the manager, the
 * tool explorer and the register flow say the same thing. Never a generic "not
 * authenticated": the sentence names the cause, and the action matches it --
 * an expired portal session needs the single re-login, a muster the portal
 * cannot reach offers no action at all (nothing was tried, nothing can be
 * retried from here), everything else a retry of the mint and probe.
 */
export function sessionGateCopy(
  session: Pick<MusterSession, 'authenticated' | 'pending' | 'failure'>,
  installation?: string,
): SessionGateCopy {
  const where = installation ? ` for ${installation}` : '';
  if (session.pending) {
    return {
      sentence: `Checking your muster session${where}…`,
    };
  }
  const failure = session.failure;
  if (failure?.kind === 'unreachable') {
    return { sentence: failure.message };
  }
  if (failure?.kind === 'session-expired') {
    return {
      sentence: failure.message,
      action: 'Sign in again',
    };
  }
  if (failure?.kind === 'mint-failed') {
    return { sentence: failure.message, action: 'Retry' };
  }
  if (failure?.kind === 'muster-rejected') {
    return {
      sentence: failure.message,
      action: 'Retry',
    };
  }
  return {
    sentence: `No muster session${where} yet.`,
    action: 'Retry',
  };
}
