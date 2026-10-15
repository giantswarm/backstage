import { useMemo } from 'react';

import { useLlmUsage } from '../../hooks/useLlmUsage';
import { modelUsageSlice, type ModelUsageSlice } from './modelUsage';

/** The window the page reads: the prototype's "last 30 days". */
export const MODEL_USAGE_WINDOW_DAYS = 30;

export type ModelUsageState = 'loading' | 'unavailable' | 'error' | 'ready';

export type ModelUsage = {
  /** The gateway's figures for the model; set only while `state` is ready. */
  slice: ModelUsageSlice | undefined;
  state: ModelUsageState;
};

/**
 * Everyone's model calls through the gateway over the last 30 days, narrowed
 * to one model — the same queries (and cache entries) the Usage screen's
 * 30-day view reads, so the Overview's Used by and the Usage tab share one
 * read.
 */
export function useModelUsage(
  installation: string,
  /** The ModelConfig's `spec.model`: what the gateway's metrics are keyed by. */
  model: string | undefined,
  /** The model's name for people, the chart's series name. */
  label: string,
): ModelUsage {
  const gateway = useLlmUsage(installation, {
    days: MODEL_USAGE_WINDOW_DAYS,
  });
  const slice = useMemo(
    () =>
      gateway.usage ? modelUsageSlice(gateway.usage, model, label) : undefined,
    [gateway.usage, model, label],
  );
  let state: ModelUsageState = 'ready';
  if (gateway.isLoading) {
    state = 'loading';
  } else if (gateway.isAvailable === false) {
    state = 'unavailable';
  } else if (gateway.isError || !gateway.usage) {
    state = 'error';
  }
  return { slice: state === 'ready' ? slice : undefined, state };
}
