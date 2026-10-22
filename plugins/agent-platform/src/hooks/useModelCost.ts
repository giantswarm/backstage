import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import { ModelCostResponse } from '@giantswarm/backstage-plugin-agent-platform-common';
import { kagentApiRef } from '../apis';
import { modelCostQueryKey } from '../lib/queryKeys';

/**
 * Why the page shows the estimate instead: the backend's own reasons, plus
 * `error` for a read that failed outright (a refused token, a failed token
 * mint, a backend that did not answer) — every expected outcome, a missing
 * Mimir included, arrives as a reason in a 200.
 */
export type ModelCostFallbackReason =
  Extract<ModelCostResponse, { status: 'unavailable' }>['reason'] | 'error';

export type ModelCostView =
  | { state: 'loading' }
  | {
      state: 'actual';
      totalUsd: number;
      /** USD per agent, keyed by kagent's encoded agent id. */
      byAgent: ReadonlyMap<string, number>;
      partial: boolean;
    }
  | { state: 'fallback'; reason: ModelCostFallbackReason };

/**
 * The caller's actual model cost on one installation over the last `days`
 * days, or why there is none — in which case the page falls back to the
 * estimate and says why.
 *
 * Not polled, like the session usage it sits beside: a window of days, read
 * on a tab visit. `enabled: false` (or no installation) answers `loading`, so
 * a caller that has not settled its window yet shows a skeleton rather than
 * a fallback it would retract.
 */
export function useModelCost(
  installation: string | undefined,
  days: number,
  options: { enabled?: boolean } = {},
): ModelCostView {
  const kagentApi = useApi(kagentApiRef);
  const enabled = Boolean(installation) && options.enabled !== false;

  const query = useQuery({
    queryKey: modelCostQueryKey(installation ?? '', days),
    queryFn: () => kagentApi.getModelCost(installation!, days),
    enabled,
    // A refused token or a missing Mimir will not fix itself on a retry, and
    // the estimate is a fine answer in the meantime.
    retry: false,
  });

  const awaiting = !enabled || isAwaitingData(query);
  const { data: body } = query;
  // Memoised so the per-agent map keeps its identity across renders, for the
  // table's memoised column maxima.
  //
  // The body before the error: a refetch that fails keeps the last good
  // `data` while `isError` turns true, and one transient failure must not
  // swap a figure the person has seen for an estimate — the rule
  // `useSessionUsage` follows beside it.
  return useMemo((): ModelCostView => {
    if (awaiting) {
      return { state: 'loading' };
    }
    if (body?.status === 'actual' && Number.isFinite(body.totalUsd)) {
      return {
        state: 'actual',
        totalUsd: body.totalUsd,
        byAgent: new Map(
          (body.byAgent ?? []).map(entry => [entry.agentId, entry.costUsd]),
        ),
        partial: Boolean(body.partial),
      };
    }
    return {
      state: 'fallback',
      reason: body?.status === 'unavailable' ? body.reason : 'error',
    };
  }, [awaiting, body]);
}
