import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import type {
  FilterToolsResponse,
  MusterApi,
  ToolsetPreset,
} from '@giantswarm/backstage-plugin-muster';

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

/** One installation's preset read, shared by both hooks below. */
function presetsQuery(musterApi: MusterApi | undefined, installation: string) {
  return {
    queryKey: musterToolsetPresetsQueryKey(installation),
    queryFn: () =>
      // `limit: 1`: the presets are the point; the page of tools is not.
      musterApi!.filterTools({ installation, includePresets: true, limit: 1 }),
    // Installation configuration; a minute of staleness is fine.
    staleTime: 60_000,
  };
}

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

  const { data, error, isPending, fetchStatus } = useQuery({
    ...presetsQuery(musterApi, installation ?? ''),
    enabled: Boolean(installation) && Boolean(musterApi),
  });
  const isLoading = isAwaitingData({ isPending, fetchStatus });

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

/** What `useQueries` keeps of each installation's preset read. */
function presetResults(results: { data?: FilterToolsResponse }[]) {
  return results.map(result => result.data?.presets);
}

/**
 * The icon muster sends for each preset, by preset name, per installation in
 * `installations` — from the same cached reads as {@link useToolsetPresets}.
 * Unchecked: `connectorMarks` decides whether one is shown. An installation
 * whose presets are not read (loading, failed, no muster) has no entry.
 */
export function useToolsetPresetIconsByInstallation(
  installations: readonly string[],
): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const musterApi = useMusterPluginApi();
  const answers = useQueries({
    queries: installations.map(installation => ({
      ...presetsQuery(musterApi, installation),
      enabled: Boolean(musterApi),
    })),
    combine: presetResults,
  });
  return useMemo(() => {
    const byInstallation = new Map<string, ReadonlyMap<string, string>>();
    installations.forEach((installation, index) => {
      const presets = answers[index];
      if (!Array.isArray(presets)) {
        return;
      }
      byInstallation.set(
        installation,
        new Map(
          presets.flatMap(preset =>
            typeof preset.icon === 'string' ? [[preset.name, preset.icon]] : [],
          ),
        ),
      );
    });
    return byInstallation;
  }, [installations, answers]);
}
