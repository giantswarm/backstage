import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { kagentApiRef } from '../apis';
import { sessionStatesQueryKey } from '../lib/queryKeys';
import { BASELINE_REFETCH_INTERVAL_MS } from '../lib/kagentSessionPolling';

/**
 * Derived session states for a list that spans installations.
 *
 * Keyed by the row's `${installation}/${sessionId}`, never by the session id
 * alone: kagent ids are only unique within an installation, and two rows of the
 * fleet list can carry the same one.
 */
export type FleetSessionStatesView = {
  states: Map<string, SessionStateEntry>;
  /**
   * Row ids the backend tried to read and could not. Their state is genuinely
   * unknown, which the column says rather than leaving the cell empty next to
   * rows whose state is merely old.
   */
  unreadable: Set<string>;
  /**
   * Installations whose summary could not be read at all, so **every** row of
   * theirs is unknown rather than merely unevaluated. Per installation and not
   * one fleet-wide flag: one installation failing says nothing about the rows of
   * the others.
   */
  failedInstallations: Set<string>;
  /**
   * Listable sessions no installation evaluated — past the cap or cut off by the
   * pass budget — summed over the installations asked.
   */
  skippedCount: number;
  /** No installation has answered yet. */
  isLoading: boolean;
  /** Every installation asked failed, so no row can be told about. */
  isError: boolean;
};

const EMPTY_VIEW: FleetSessionStatesView = {
  states: new Map(),
  unreadable: new Set(),
  failedInstallations: new Set(),
  skippedCount: 0,
  isLoading: false,
  isError: false,
};

/**
 * The derived state of each session, across the installations a list shows.
 *
 * One `GET /kagent/session-states` per installation, under the same query key
 * `useSessionStates` uses — so a list and a session detail page open together
 * share one cache entry per installation rather than each paying for its own.
 *
 * **Baseline tier, not the fast one the rail polls on.** The rail watches a
 * single installation and exists to show a turn moving; a list spans the fleet,
 * and each pass costs its installation one `ListTasks` per candidate session
 * (status only — no history, no artifacts). At the fast tier an eleven-
 * installation scope would spend that every 15 s for a column nobody is watching
 * for progress. A minute is well inside how long a person reads a list before
 * acting on it, and opening a session shows its live state immediately.
 */
export function useFleetSessionStates(
  installations: string[],
): FleetSessionStatesView {
  const kagentApi = useApi(kagentApiRef);

  // Keyed on contents: the caller derives this array fresh on every render.
  const key = installations.join(',');
  const targets = useMemo(() => (key ? key.split(',') : []), [key]);

  const results = useQueries({
    queries: targets.map(installation => ({
      queryKey: sessionStatesQueryKey(installation),
      queryFn: () => kagentApi.listSessionStates(installation),
      refetchInterval: BASELINE_REFETCH_INTERVAL_MS,
    })),
  });

  // useQueries returns fresh arrays every render, so key the memo on a stable
  // signature of the per-installation outcomes — the same shape the sessions
  // fan-out keys on.
  const readSignature = targets
    .map((installation, index) => {
      const query = results[index];
      return `${installation}:${query?.status}:${query?.dataUpdatedAt}`;
    })
    .join('|');

  return useMemo(() => {
    if (targets.length === 0) {
      return EMPTY_VIEW;
    }

    const states = new Map<string, SessionStateEntry>();
    const unreadable = new Set<string>();
    const failedInstallations = new Set<string>();
    let skippedCount = 0;

    targets.forEach((installation, index) => {
      const data = results[index]?.data;
      if (!data) {
        // Only once it has actually failed. A query still in flight is not a
        // failure, and calling it one would flash "Unknown" across the column on
        // every first load.
        if (results[index]?.isError) {
          failedInstallations.add(installation);
        }
        return;
      }
      for (const entry of data.states) {
        states.set(`${installation}/${entry.sessionId}`, entry);
      }
      for (const sessionId of data.unreadable) {
        unreadable.add(`${installation}/${sessionId}`);
      }
      skippedCount += data.skipped;
    });

    return {
      states,
      unreadable,
      failedInstallations,
      skippedCount,
      // Only while nothing is in yet. One slow installation must not blank the
      // column for the rows that already have a state — the same rule the
      // sessions fan-out itself follows.
      isLoading: results.every(result => result.isLoading),
      // A failed *refetch* keeps the previous answer, so this is the harder
      // claim: every installation asked failed and none has data to fall back
      // on.
      isError: results.every(
        result => result.isError && result.data === undefined,
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, readSignature]);
}
