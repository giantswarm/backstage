import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  AgentManagerError,
  hasReachedWrittenRevision,
  isSettledVerdict,
  type AgentStatus,
} from '../lib/agentManager';
import { musterAgentStatusQueryKey } from '../lib/queryKeys';
import { useAgentManagerClient } from './useAgentManager';

/**
 * How often `get_agent_status` is re-read while the template is still
 * compiling. A fresh release renders its template within seconds and the
 * agent's Harness reports Ready shortly after; this is the pace a person
 * watching the page notices without hammering agent-manager.
 */
export const AGENT_STATUS_POLL_INTERVAL_MS = 3_000;

/**
 * How long to wait for a write's revision to appear before taking the verdict
 * as it stands.
 *
 * Waiting on the generation is what stops a pre-write `ready` being reported as
 * success, but it must not wait for ever: an update that changes nothing the
 * chart renders leaves the template's generation where it was, and a person
 * watching a spinner that never resolves is worse off than one told the current
 * verdict. A minute is comfortably past the seconds helm-controller and the
 * Harness normally take, and also covers the case where the release cannot be
 * reconciled at all (suspended, or failing), where the generation would never
 * move.
 */
export const MAX_REVISION_WAIT_MS = 60_000;

/**
 * How soon a `failed` verdict is re-read first, and how far apart the re-reads
 * get: each wait is as long as the verdict has been `failed` so far, so the
 * interval doubles from 5 s up to a minute.
 *
 * A `failed` right after a create is often not final. The release renders the
 * Agent beside the tool server it references, and until that server exists
 * kagent reports the reference unresolved; it clears within seconds. Only
 * `ready` ends the poll, so that failure turns into Ready without a reload. A
 * stopgap until agent-manager reports such a state as `progressing`
 * (giantswarm/agent-manager#145).
 */
export const FAILED_STATUS_POLL_INITIAL_MS = 5_000;
export const FAILED_STATUS_POLL_MAX_MS = 60_000;

export type AgentStatusState = {
  status: AgentStatus | undefined;
  /** True until the verdict is `ready` or `failed`. */
  isSettling: boolean;
  /**
   * agent-manager answered `not_found`: by its contract, neither an
   * Agent object nor a HelmRelease of that name exists. Right after a create
   * this is transient and polled through (see {@link isSettling}); on a page
   * reached any other way it is the difference between "not yet" and "not
   * there".
   */
  isNotFound: boolean;
  error: Error | null;
};

/**
 * `get_agent_status` for one agent, polled until the agent's Harness has a
 * verdict: `ready`, or `failed` with the reason. A `failed` verdict is still
 * re-read, less and less often, in case it clears (see
 * {@link FAILED_STATUS_POLL_INITIAL_MS}); only `ready` stops the poll. On API
 * v2 that verdict comes from the Agent object's `status.conditions` —
 * the same rules the detail page's own readiness reads, so the two agree. A
 * `not_found` right after the create is the release not having rendered the
 * Agent yet, and is polled through like `progressing`.
 */
export function useAgentStatus(
  installation: string | undefined,
  namespace: string,
  name: string,
  options: {
    enabled?: boolean;
    fromGeneration?: number;
    /**
     * Identifies the write being followed, so each one gets a watch of its own.
     * Without it two writes that start from the same generation share a cache
     * entry, and the second is served the first's settled result.
     */
    watchId?: string;
  } = {},
): AgentStatusState {
  const client = useAgentManagerClient(installation);
  const enabled = (options.enabled ?? true) && Boolean(client) && Boolean(name);
  // A read with no write behind it passes no `watchId` and keeps the plain key,
  // so the detail page's own existence check and the create flow's progress
  // still share one entry.
  const { fromGeneration, watchId } = options;

  // The deadline has to schedule its own render, not be a clock read taken
  // whenever one happens anyway. This query is destructured to `{ data, error }`,
  // so react-query tracks those two props, and an unchanged status is
  // structurally shared — a poll that answers byte-identically keeps `data`'s
  // reference and notifies nobody. In exactly the case the bound exists for (a
  // release that cannot reconcile, so the generation never moves and every
  // answer is identical) the component would render once and never again, and
  // comparing `Date.now()` on that one render would leave the waiting alert up
  // for good.
  const [givenUpWaiting, setGivenUpWaiting] = useState(false);
  useEffect(() => {
    if (fromGeneration === undefined) {
      // No revision to wait for, so nothing to give up on.
      return undefined;
    }
    setGivenUpWaiting(false);
    const timer = setTimeout(
      () => setGivenUpWaiting(true),
      MAX_REVISION_WAIT_MS,
    );
    return () => clearTimeout(timer);
  }, [fromGeneration, watchId, installation, namespace, name]);

  // When the current run of `failed` answers began, on the clock of the reads
  // themselves (`dataUpdatedAt`): an interval computed from it holds still
  // between two reads, where one from `Date.now()` would change on every render
  // and restart react-query's timer each time.
  const failedSince = useRef<number>();

  const { data, error } = useQuery({
    queryKey: musterAgentStatusQueryKey(
      installation ?? '',
      namespace,
      name,
      watchId,
    ),
    enabled,
    queryFn: () => client!.getAgentStatus(namespace, name),
    refetchInterval: query => {
      const verdict = query.state.data?.verdict;
      if (verdict !== 'failed') {
        failedSince.current = undefined;
      }
      if (verdict && isSettledVerdict(verdict)) {
        // A settled verdict for the revision that was there before the write is
        // not this write's answer; keep polling until the new one shows up, or
        // until the wait has gone on long enough to be the wrong thing to do.
        if (
          !hasReachedWrittenRevision(query.state.data, fromGeneration) &&
          !givenUpWaiting
        ) {
          return AGENT_STATUS_POLL_INTERVAL_MS;
        }
        if (verdict === 'ready') {
          return false;
        }
        failedSince.current ??= query.state.dataUpdatedAt;
        return Math.min(
          FAILED_STATUS_POLL_MAX_MS,
          FAILED_STATUS_POLL_INITIAL_MS +
            (query.state.dataUpdatedAt - failedSince.current),
        );
      }
      const lastError = query.state.error;
      if (
        lastError &&
        !(
          lastError instanceof AgentManagerError &&
          lastError.code === 'not_found'
        )
      ) {
        return false;
      }
      return AGENT_STATUS_POLL_INTERVAL_MS;
    },
    // The interval above is the retry: an error other than not_found stops
    // it and is shown; a not_found keeps polling.
    retry: false,
  });

  const notFoundYet =
    error instanceof AgentManagerError && error.code === 'not_found';

  return {
    status: data,
    isNotFound: notFoundYet,
    isSettling:
      enabled &&
      (notFoundYet ||
        !data ||
        !isSettledVerdict(data.verdict) ||
        (!hasReachedWrittenRevision(data, fromGeneration) &&
          !givenUpWaiting)) &&
      (!error || notFoundYet),
    error: error && !notFoundYet ? (error as Error) : null,
  };
}
