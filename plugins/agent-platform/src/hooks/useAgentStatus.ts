import { useQuery } from '@tanstack/react-query';

import {
  AgentManagerError,
  hasReachedWrittenRevision,
  isSettledVerdict,
  type AgentStatus,
} from '../lib/agentManager';
import {
  backoffRefetchInterval,
  isMissingReferenceStatus,
  PROVISIONING_GRACE_MS,
} from '../lib/agentProvisioning';
import { useDeadlinePassed, useWatchStartedAt } from './useDeadlinePassed';
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
 * The longest interval a `failed` verdict that may still be the agent being
 * set up ({@link AgentStatusState.isSettingUp}) is re-read at, backing off from
 * {@link AGENT_STATUS_POLL_INTERVAL_MS}. Any other `failed` verdict is not
 * re-read: the detail page's own Agent read follows a failure that clears.
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
   * The verdict is `failed` on a reference to an object not created yet (see
   * `isMissingReferenceStatus`), for a read with no write baseline (a create,
   * or the detail page's own check), within {@link PROVISIONING_GRACE_MS} of
   * when this watch started: agent-manager's status carries no creation
   * timestamp, so the page's first sight of the agent stands in for it. Shown
   * as the agent being set up rather than as a failure, and re-read meanwhile.
   * Once the page has the Agent object, its own creation timestamp decides
   * instead (`useAgentSettingUp`).
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
 * `ready`, and at `failed` unless the failure may still be the agent being set
 * up (see {@link AgentStatusState.isSettingUp}), which is re-read with a
 * backoff while it may.
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
    /**
     * The caller knows a `failed` verdict may still clear — the detail page,
     * while the agent's HelmRelease is new and still reconciling — so it is
     * re-read, backing off, for as long as this is true.
     */
    keepReadingFailed?: boolean;
  } = {},
): AgentStatusState {
  const client = useAgentManagerClient(installation);
  const enabled = (options.enabled ?? true) && Boolean(client) && Boolean(name);
  // A read with no write behind it passes no `watchId` and keeps the plain key,
  // so the detail page's own existence check and the create flow's progress
  // still share one entry.
  const { fromGeneration, watchId, keepReadingFailed = false } = options;

  // One clock for this watch, keyed by what is being watched: started on the
  // render that first sees the watch enabled, and kept while it is disabled
  // and re-enabled (the detail page's check turns off while the Agent read
  // finds the object and back on if it 404s again), so neither deadline below
  // restarts for the same agent.
  const watchStartedAt = useWatchStartedAt(
    enabled
      ? [installation, namespace, name, watchId, fromGeneration].join('/')
      : undefined,
  );

  // Both deadlines schedule their own render, not a clock read taken whenever
  // one happens anyway (`useDeadlinePassed`): this query is destructured to
  // `{ data, error }`, so react-query tracks those two props, and an unchanged
  // status is structurally shared — a poll that answers byte-identically keeps
  // `data`'s reference and notifies nobody. In exactly the case the revision
  // bound exists for (a release that cannot reconcile, so the generation never
  // moves and every answer is identical) the component would render once and
  // never again.
  const givenUpWaiting = useDeadlinePassed(
    // No revision to wait for, so nothing to give up on.
    fromGeneration !== undefined && watchStartedAt !== undefined
      ? watchStartedAt + MAX_REVISION_WAIT_MS
      : undefined,
  );
  // A write with a baseline is on an agent that already existed, so it gets
  // no grace: only a create, or a read with no write behind it, does.
  const graceUntil =
    fromGeneration === undefined && watchStartedAt !== undefined
      ? watchStartedAt + PROVISIONING_GRACE_MS
      : undefined;
  const isPastGrace = useDeadlinePassed(graceUntil);

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
        // `ready` is the answer, and so is any `failed` but a new agent's
        // missing reference, re-read until its grace is over, or one the
        // caller says may still clear; both less often the longer they stand.
        const now = Date.now();
        const isMissingReference =
          graceUntil !== undefined &&
          now < graceUntil &&
          isMissingReferenceStatus(query.state.data!);
        if (verdict === 'failed' && (isMissingReference || keepReadingFailed)) {
          return backoffRefetchInterval(
            now - (watchStartedAt ?? now),
            AGENT_STATUS_POLL_INTERVAL_MS,
            FAILED_STATUS_MAX_POLL_INTERVAL_MS,
          );
        }
        return false;
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
      graceUntil !== undefined &&
      !isPastGrace &&
      data !== undefined &&
      isMissingReferenceStatus(data),
    error: error && !notFoundYet ? (error as Error) : null,
  };
}
