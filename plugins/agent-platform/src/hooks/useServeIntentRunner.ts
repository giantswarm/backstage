import { useCallback, useEffect, useRef, useState } from 'react';

import { ModelManagerToolsClient } from '../apis/ModelManagerToolsClient';
import { poolLifecycleSteps } from '../lib/poolLifecycle';
import {
  isServedModelReady,
  refusedOutcome,
  SERVE_INTENT_BACKEND,
  servedModelOf,
  staleServeIntentIds,
} from '../lib/serveIntent';
import type { ServedModel } from '../lib/serving';
import type { GpuNodePoolRow } from './useClusterManager';
import { useMusterPluginApi } from './useMusterPluginApi';
import { useInvalidateModelManagerReadsFor } from './useServedModelAction';
import type { ServeIntentsStore } from './useServeIntents';

export type ServeIntentRunnerInput = {
  store: ServeIntentsStore;
  /** The pools cluster-manager lists, with their clusters' readiness. */
  rows: readonly GpuNodePoolRow[];
  /** The served models of every installation in view (the Serving view's rows). */
  servedModels: readonly ServedModel[];
  /** The installations whose pools were read without error (for pruning stale intents). */
  settledInstallations: readonly string[];
};

export type ServeIntentRunner = {
  /** `check_fit` → `load_model` is in flight for the pool. */
  isServing: (poolId: string) => boolean;
  /** A failed `load_model`: forget the outcome, the next render asks again. */
  retry: (poolId: string) => void;
};

/**
 * Whether the pool's own lifecycle is done — the release, the Karpenter pool,
 * the GPU operator, the serving stack and the backend registration — so the
 * stack takes a load: the same gate as **Serve your first model**.
 */
export function isPoolStackReady(row: GpuNodePoolRow): boolean {
  return poolLifecycleSteps(row.pool, row.cluster).every(
    step => step.state === 'done',
  );
}

/**
 * Serves each pool's intent once its stack is ready, as the signed-in person:
 * `check_fit` then `load_model {backend: kserve, model: <preset>}` through
 * the installation's muster — the calls the Serve dialog makes — exactly
 * once per intent, whatever the panel is doing. The outcome is persisted with
 * the intent (`served` with the object model-manager composed, `refused` with
 * `check_fit`'s reason verbatim, `failed` with what `load_model` threw), so a
 * reload, a second tab or a return after a walk-away never repeats the load. A
 * served model of that preset already on the cluster is the outcome too, and
 * the first read that shows it ready is kept, so the step stays done once the
 * model is stopped. Intents of pools a settled list no longer carries are
 * pruned after a while (`staleServeIntentIds`).
 */
export function useServeIntentRunner(
  input: ServeIntentRunnerInput,
): ServeIntentRunner {
  const { store, rows, servedModels, settledInstallations } = input;
  const { intents, setOutcome, clearOutcome, remove } = store;
  const musterApi = useMusterPluginApi();
  const invalidate = useInvalidateModelManagerReadsFor();
  // The loads in flight, by pool id — a ref so a re-render mid-call never
  // starts a second one, mirrored in state for the panel's wording.
  const running = useRef(new Set<string>());
  const [inFlight, setInFlight] = useState<string[]>([]);

  useEffect(() => {
    for (const [id, intent] of Object.entries(intents)) {
      const model = servedModelOf(intent, servedModels);
      if (intent.outcome?.kind === 'served') {
        if (model && !intent.outcome.ready && isServedModelReady(model)) {
          setOutcome(id, {
            ...intent.outcome,
            ready:
              model.steps?.find(step => step.name === 'ready')?.finishedAt ??
              new Date().toISOString(),
          });
        }
        continue;
      }
      if (intent.outcome || running.current.has(id)) {
        continue;
      }
      if (model) {
        // Served already — from the dialog, or by somebody else: nothing to load.
        setOutcome(id, {
          kind: 'served',
          resource: model.name,
          at: new Date().toISOString(),
          ...(isServedModelReady(model)
            ? { ready: new Date().toISOString() }
            : {}),
        });
        continue;
      }
      const row = rows.find(candidate => candidate.id === id);
      if (!row || !isPoolStackReady(row) || !musterApi) {
        continue;
      }
      running.current.add(id);
      setInFlight(Array.from(running.current));
      const client = new ModelManagerToolsClient(
        musterApi,
        intent.installation,
      );
      const request = { model: intent.preset, backend: SERVE_INTENT_BACKEND };
      (async () => {
        try {
          const fit = await client.checkFit(request);
          if (!fit.fits) {
            setOutcome(id, refusedOutcome(fit));
            return;
          }
          const answer = await client.loadModel(request);
          setOutcome(id, {
            kind: 'served',
            resource: answer.running?.resource ?? answer.name,
            at: new Date().toISOString(),
          });
          await invalidate(intent.installation);
        } catch (error) {
          setOutcome(id, {
            kind: 'failed',
            message: error instanceof Error ? error.message : String(error),
            at: new Date().toISOString(),
          });
        } finally {
          running.current.delete(id);
          setInFlight(Array.from(running.current));
        }
      })();
    }
  }, [intents, rows, servedModels, musterApi, setOutcome, invalidate]);

  useEffect(() => {
    const stale = staleServeIntentIds(intents, {
      rowIds: new Set(rows.map(row => row.id)),
      settledInstallations,
    });
    if (stale.length > 0) {
      remove(stale);
    }
  }, [intents, rows, settledInstallations, remove]);

  const isServing = useCallback(
    (poolId: string) => inFlight.includes(poolId),
    [inFlight],
  );
  const retry = useCallback(
    (poolId: string) => clearOutcome(poolId),
    [clearOutcome],
  );
  return { isServing, retry };
}
