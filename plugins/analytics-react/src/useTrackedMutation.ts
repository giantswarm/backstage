import { useAnalytics } from '@backstage/core-plugin-api';
import {
  useMutation,
  type QueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';

import type { PortalEvent } from './events';

/**
 * How a write is tracked: `event` names the event its success reports (or
 * null for a success that is not one, such as an edit through a create
 * wizard), or `event: null` with the reason the write is not tracked at all.
 * There is no default, so leaving a write untracked is a decision in the code.
 */
export type MutationTracking<TData, TVariables> =
  | {
      event: (data: TData, variables: TVariables) => PortalEvent | null;
      untrackedReason?: never;
    }
  | { event: null; untrackedReason: string };

export type TrackedMutationOptions<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TOnMutateResult = unknown,
> = UseMutationOptions<TData, TError, TVariables, TOnMutateResult> &
  MutationTracking<TData, TVariables>;

/**
 * `useMutation` that reports its event once the write succeeded, through
 * Backstage's analytics API: the app's connector forwards it, Backstage adds
 * the plugin and route, and a portal without a connector drops it. Plugins
 * call this instead of `useMutation`; ESLint refuses the plain one in
 * `plugins/*\/src`.
 */
export function useTrackedMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TOnMutateResult = unknown,
>(
  options: TrackedMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  queryClient?: QueryClient,
): UseMutationResult<TData, TError, TVariables, TOnMutateResult> {
  const analytics = useAnalytics();
  const {
    event,
    untrackedReason: _untrackedReason,
    ...mutationOptions
  } = options;
  const { onSuccess } = mutationOptions;

  return useMutation(
    {
      ...mutationOptions,
      onSuccess: (data, variables, ...rest) => {
        const reported = event?.(data, variables);
        if (reported) {
          analytics.captureEvent(reported.name, reported.name, {
            attributes: reported.attributes,
          });
        }
        return onSuccess?.(data, variables, ...rest);
      },
    },
    queryClient,
  );
}
