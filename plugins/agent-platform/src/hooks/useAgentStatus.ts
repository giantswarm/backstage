import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  AgentManagerError,
  hasReachedWrittenRevision,
  isSettledVerdict,
  type AgentStatus,
} from '../lib/agentManager';
import {
  backoffRefetchInterval,
  isTerminalAgentStatus,
  PROVISIONING_GRACE_MS,
} from '../lib/agentProvisioning';
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
 * The longest interval a `failed` verdict is re-read at. A failure is re-read
 * rather than taken as final — the agent may still be being set up, or be fixed
 * by hand — starting at {@link AGENT_STATUS_POLL_INTERVAL_MS} and backing off
 * to this.
 */
export const FAILED_STATUS_MAX_POLL_INTERVAL_MS = 60_000;

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
  /**
   * The verdict is `failed`, but for a reason that resolves on its own while
   * the agent is provisioned — a release not ready yet, an unresolved
   * reference — and the watch is younger than {@link PROVISIONING_GRACE_MS}.
   * Shown as the agent being set up rather than as a failure. The verdict is
   * still re-read, so the page follows it to `ready` without a reload.
   */
  isSettingUp: boolean;
  error: Error | null;
};

/**
 * `get_agent_status` for one agent, polled until the agent's Harness has a
 * verdict: `ready`, or `failed` with the reason. On API v2 that verdict comes
 * from the Agent object's `status.conditions` —
 * the same rules the detail page's own readiness reads, so the two agree. A
 * `not_found` right after the create is the release not having rendered the
 * Agent yet, and is polled through like `progressing`. Polling stops at
 * `ready`; a `failed` verdict is re-read with a backoff, since it may still
 * turn `ready` (see {@link AgentStatusState.isSettingUp}).
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

  // When this watch started, for the grace a `failed` verdict gets and the
  // backoff it is re-read at. agent-manager's status carries no timestamps, so
  // the watch is the clock: right after a write it starts with the write. Its
  // end schedules a render for the same reason the revision wait above does.
  const watchStartedAt = useRef(Date.now());
  const [isPastGrace, setPastGrace] = useState(false);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    watchStartedAt.current = Date.now();
    setPastGrace(false);
    const timer = setTimeout(() => setPastGrace(true), PROVISIONING_GRACE_MS);
    return () => clearTimeout(timer);
  }, [enabled, watchId, installation, namespace, name]);

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
        // `ready` is the answer. `failed` is the answer for now: right after a
        // create it is often the agent still being set up, and a failure fixed
        // by hand turns `ready` too, so it is re-read, less often the longer it
        // stands.
        return verdict === 'ready'
          ? false
          : backoffRefetchInterval(
              Date.now() - watchStartedAt.current,
              AGENT_STATUS_POLL_INTERVAL_MS,
              FAILED_STATUS_MAX_POLL_INTERVAL_MS,
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

  const isSettling =
    enabled &&
    (notFoundYet ||
      !data ||
      !isSettledVerdict(data.verdict) ||
      (!hasReachedWrittenRevision(data, fromGeneration) && !givenUpWaiting)) &&
    (!error || notFoundYet);

  return {
    status: data,
    isNotFound: notFoundYet,
    isSettling,
    isSettingUp:
      enabled &&
      !isSettling &&
      !error &&
      data?.verdict === 'failed' &&
      !isPastGrace &&
      !isTerminalAgentStatus(data),
    error: error && !notFoundYet ? (error as Error) : null,
  };
}
