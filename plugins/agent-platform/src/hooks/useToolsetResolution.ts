import { useQuery } from '@tanstack/react-query';
import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import { musterToolsetResolutionQueryKey } from '../lib/queryKeys';
import { isUnknownPresetError, toolsetWasEvaluated } from '../lib/toolset';
import { useMusterPluginApi } from './useMusterPluginApi';

/**
 * Large enough to hold any real resolution in one page: the biggest gateway
 * today exposes a few hundred tools, and `filter_tools` defaults to five.
 * `truncated` still says when even this was not enough.
 */
export const RESOLUTION_PAGE_SIZE = 1000;

export type ToolsetResolution = {
  /** The tools the toolset resolves to for the caller, when muster answered. */
  tools: ToolSummary[];
  /** Selectors that match nothing for the caller (a renamed tool, a server they cannot see). */
  unmatched: string[];
  /** The page did not hold the whole resolution. */
  truncated: boolean;
  isLoading: boolean;
  /**
   * `resolved`: muster evaluated the toolset. `unknown-preset`: muster refused
   * it for naming a preset it does not know (`error` carries muster's message).
   * `error`: another failure. `unsupported`: this muster predates toolsets and
   * answered the unscoped catalogue instead, which is not a resolution.
   * `unavailable`: the muster plugin is not installed. `idle`: nothing to
   * resolve yet.
   */
  status:
    | 'idle'
    | 'loading'
    | 'resolved'
    | 'unknown-preset'
    | 'error'
    | 'unsupported'
    | 'unavailable';
  error?: string;
};

/**
 * What a toolset resolves to *for the caller*, from `filter_tools({ toolset })`
 * in the caller's own muster session: the Tools step shows it while the author
 * composes, the agent page shows a viewer what the agent can use through them.
 * Never persisted (per user) and re-read when the muster plugin's sign-in
 * completes (its `['muster']` invalidation) — see `lib/queryKeys.ts`.
 */
export function useToolsetResolution(
  installation: string | undefined,
  selectors: string[],
): ToolsetResolution {
  const musterApi = useMusterPluginApi();
  const enabled =
    Boolean(installation) && Boolean(musterApi) && selectors.length > 0;

  const { data, isLoading, error } = useQuery({
    queryKey: musterToolsetResolutionQueryKey(installation ?? '', selectors),
    enabled,
    queryFn: () =>
      musterApi!.filterTools({
        installation,
        toolset: selectors,
        limit: RESOLUTION_PAGE_SIZE,
      }),
    // A refused toolset stays refused; retrying only delays the message.
    retry: false,
  });

  const empty = { tools: [], unmatched: [], truncated: false };

  if (!musterApi) {
    return { ...empty, isLoading: false, status: 'unavailable' };
  }
  if (!enabled) {
    return { ...empty, isLoading: false, status: 'idle' };
  }
  if (error) {
    const message = (error as Error).message;
    return {
      ...empty,
      isLoading: false,
      status: isUnknownPresetError(message) ? 'unknown-preset' : 'error',
      error: message,
    };
  }
  if (!data) {
    return { ...empty, isLoading, status: 'loading' };
  }
  if (!toolsetWasEvaluated(data)) {
    return { ...empty, isLoading: false, status: 'unsupported' };
  }
  return {
    tools: data.tools ?? [],
    unmatched: data.toolset_unmatched ?? [],
    truncated: Boolean(data.truncated),
    isLoading: false,
    status: 'resolved',
  };
}
