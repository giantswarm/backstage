/**
 * Why a template was not started for want of a sign-in:
 * - `session-expired` -- the person's main portal session is gone.
 * - `declined` -- the person declined an installation's Login Required prompt
 *   or closed its popup.
 */
export type TemplateSignInFailure = 'session-expired' | 'declined';

/**
 * Thrown by `scaffold` before the task is created when a sign-in the submit
 * asked for did not complete: the portal's own session is gone and the
 * re-login was declined or failed, or a cluster token the template needs could
 * not be minted. Every sign-in the submit asked for has settled by the time it
 * is thrown.
 */
export class TemplateSignInError extends Error {
  readonly name = 'TemplateSignInError';

  constructor(
    readonly reason: TemplateSignInFailure,
    readonly installations: string[],
    readonly cause: unknown,
  ) {
    super(
      reason === 'session-expired'
        ? 'Your portal session expired before the template was started.'
        : `Sign-in to ${installations.join(', ')} did not complete.`,
    );
  }
}
