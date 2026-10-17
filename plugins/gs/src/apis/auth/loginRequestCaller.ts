/**
 * The callers that may open the main sign-in (Login Required) while a person
 * acts: the portal's fetch (`X-Backstage-Token`) and the broker-backed
 * cluster-token mint. Both ask the same main login provider, so the dialog
 * alone cannot tell which of them asked.
 */
export type LoginRequestCaller = 'portal-fetch' | 'cluster-token-mint';

/**
 * Set on `document.body` while a caller waits on the main sign-in's
 * interactive path: the callers, space-separated and sorted. An open Login
 * Required dialog was asked for by the callers it names; the dialog itself is
 * unchanged.
 */
export const LOGIN_REQUESTED_BY_ATTRIBUTE = 'data-login-requested-by';

const waiting = new Map<LoginRequestCaller, number>();

function render() {
  if (typeof document === 'undefined' || !document.body) {
    return;
  }
  const callers = [...waiting.keys()].sort();
  if (callers.length) {
    document.body.setAttribute(LOGIN_REQUESTED_BY_ATTRIBUTE, callers.join(' '));
  } else {
    document.body.removeAttribute(LOGIN_REQUESTED_BY_ATTRIBUTE);
  }
}

/**
 * Runs `request`, the caller's interactive call to the main sign-in, with the
 * caller named in {@link LOGIN_REQUESTED_BY_ATTRIBUTE} until it settles.
 */
export async function asLoginRequestCaller<T>(
  caller: LoginRequestCaller,
  request: () => Promise<T>,
): Promise<T> {
  waiting.set(caller, (waiting.get(caller) ?? 0) + 1);
  render();
  try {
    return await request();
  } finally {
    const left = waiting.get(caller)! - 1;
    if (left) {
      waiting.set(caller, left);
    } else {
      waiting.delete(caller);
    }
    render();
  }
}
