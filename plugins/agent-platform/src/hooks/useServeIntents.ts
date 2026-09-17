import { useCallback, useMemo } from 'react';
import useLocalStorageState from 'use-local-storage-state';

import {
  parseServeIntents,
  poolIdOf,
  SERVE_INTENTS_STORAGE_KEY,
  type PoolRef,
  type ServeChoice,
  type ServeIntent,
  type ServeIntentOutcome,
  type ServeIntents,
  newServeIntent,
} from '../lib/serveIntent';

export type ServeIntentsStore = {
  /** Every intent by pool id, as persisted. */
  intents: ServeIntents;
  intentOf: (poolId: string) => ServeIntent | undefined;
  /** Deploy carried a preset: remember it for the pool (replacing an older intent of the same pool). */
  record: (pool: PoolRef, choice: ServeChoice) => void;
  /** The one `load_model` ended (or the served model was found): keep how. */
  setOutcome: (poolId: string, outcome: ServeIntentOutcome) => void;
  /** Forget the outcome, so the runner asks model-manager once more. */
  clearOutcome: (poolId: string) => void;
  /** The pool was removed: the intent goes with it. */
  remove: (poolIds: string[]) => void;
};

/**
 * The serve intents of GPU node pools, persisted in localStorage per
 * browser (the same store the plugin's other remembered UI state uses):
 * what Deploy chose to serve, and how the one `load_model` for it ended. Not
 * namespaced per user — a preset name per pool says nothing about the
 * person, and the pool itself is read live from cluster-manager on every
 * visit. Parsed tolerantly ({@link parseServeIntents}): an entry an older
 * portal wrote that does not read as an intent is simply not there.
 */
export function useServeIntents(): ServeIntentsStore {
  const [raw, setRaw] = useLocalStorageState<ServeIntents>(
    SERVE_INTENTS_STORAGE_KEY,
    { defaultValue: {} },
  );
  const intents = useMemo(() => parseServeIntents(raw), [raw]);

  const record = useCallback(
    (pool: PoolRef, choice: ServeChoice) =>
      setRaw(current => ({
        ...parseServeIntents(current),
        [poolIdOf(pool)]: newServeIntent(pool, choice),
      })),
    [setRaw],
  );
  const setOutcome = useCallback(
    (poolId: string, outcome: ServeIntentOutcome) =>
      setRaw(current => {
        const all = parseServeIntents(current);
        const intent = all[poolId];
        return intent ? { ...all, [poolId]: { ...intent, outcome } } : all;
      }),
    [setRaw],
  );
  const clearOutcome = useCallback(
    (poolId: string) =>
      setRaw(current => {
        const all = parseServeIntents(current);
        const intent = all[poolId];
        if (!intent) {
          return all;
        }
        const { outcome: _gone, ...rest } = intent;
        return { ...all, [poolId]: rest };
      }),
    [setRaw],
  );
  const remove = useCallback(
    (poolIds: string[]) =>
      setRaw(current => {
        const all = parseServeIntents(current);
        for (const id of poolIds) {
          delete all[id];
        }
        return all;
      }),
    [setRaw],
  );

  return useMemo(
    () => ({
      intents,
      intentOf: (poolId: string) => intents[poolId],
      record,
      setOutcome,
      clearOutcome,
      remove,
    }),
    [intents, record, setOutcome, clearOutcome, remove],
  );
}
