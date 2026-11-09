import {
  isPermanentReadError,
  pollingQueryOptions,
  type PollingQuery,
  type PollingQueryOptions,
  type PollingRuleOptions,
  type PollInterval,
} from '@giantswarm/backstage-plugin-ui-react';
import { isMusterAuthFailure } from '../apis/musterUnauthorized';

/**
 * Whether a failed read through muster gets the same answer however often it
 * is asked, until the person does something about it: a 401 or 403
 * ({@link isPermanentReadError}) — above all muster's 401 with
 * `reason: 'server_sign_in_required'`, the person not signed in to the
 * server, where every call makes muster create another sign-in challenge —
 * or any other muster auth failure ({@link isMusterAuthFailure}: a portal
 * session that is gone). Read from the error and its `cause` chain, never
 * from the message text.
 */
export function isPermanentMusterReadError(error: unknown): boolean {
  return isPermanentReadError(error) || isMusterAuthFailure(error);
}

/**
 * `pollingQueryOptions` for a read through muster: no polling from a hidden
 * tab, a read when it becomes visible again, and no polling after a
 * permanent error ({@link isPermanentMusterReadError}) until a read succeeds
 * again — after the person signed in, say. `stopOnError` adds errors of the
 * caller's own that are permanent too; the other options pass through.
 */
export function musterPollingOptions<
  TQuery extends PollingQuery = PollingQuery,
>(
  interval: PollInterval<TQuery>,
  { stopOnError, ...options }: PollingRuleOptions = {},
): PollingQueryOptions<TQuery> {
  return pollingQueryOptions(interval, {
    ...options,
    stopOnError: error =>
      isPermanentMusterReadError(error) || Boolean(stopOnError?.(error)),
  });
}
