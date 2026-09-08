import { useQuery } from '@tanstack/react-query';
import type { ToolsetPreset } from '@giantswarm/backstage-plugin-muster';

import { musterToolsetPresetsQueryKey } from '../lib/queryKeys';
import {
  BUILT_IN_PRESETS,
  offeredPresets,
  orderPresets,
  withBuiltInPresets,
} from '../lib/toolset';
import { useMusterPluginApi } from './useMusterPluginApi';

export type ToolsetPresets = {
  /**
   * The presets to offer as cards, safe ones first and `full` last. Never
   * `none` — on the step, no tools is the empty selection — and never empty.
   */
  presets: ToolsetPreset[];
  isLoading: boolean;
  /**
   * How the list was obtained: `muster` when the aggregator listed its presets
   * (built-ins plus the installation's own); `built-in` when only the three
   * muster always knows can be offered — the muster plugin is not installed,
   * the aggregator predates toolsets and ignored `include_presets`, or the
   * read failed.
   */
  source: 'muster' | 'built-in';
  /** Why the aggregator could not be asked, when it could not. */
  error?: string;
};

/**
 * The toolset presets an installation's muster knows, from
 * `filter_tools({ include_presets: true })`. Read through the caller's own
 * session (there is no other way to reach muster), so the key is never
 * persisted — see `lib/queryKeys.ts`.
 */
export function useToolsetPresets(
  installation: string | undefined,
): ToolsetPresets {
  const musterApi = useMusterPluginApi();

  const { data, isLoading, error } = useQuery({
    queryKey: musterToolsetPresetsQueryKey(installation ?? ''),
    enabled: Boolean(installation) && Boolean(musterApi),
    queryFn: () =>
      // `limit: 1`: the presets are the point; the page of tools is not.
      musterApi!.filterTools({ installation, includePresets: true, limit: 1 }),
    // Installation configuration; a minute of staleness is fine.
    staleTime: 60_000,
  });

  if (!musterApi || !installation) {
    return {
      presets: offeredPresets(orderPresets(BUILT_IN_PRESETS)),
      isLoading: false,
      source: 'built-in',
    };
  }

  if (data && Array.isArray(data.presets)) {
    return {
      presets: offeredPresets(withBuiltInPresets(data.presets)),
      isLoading: false,
      source: 'muster',
    };
  }

  return {
    presets: offeredPresets(orderPresets(BUILT_IN_PRESETS)),
    isLoading,
    source: 'built-in',
    error: error ? (error as Error).message : undefined,
  };
}
