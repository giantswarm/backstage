import { useMemo } from 'react';
import {
  ConfigMap,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  MODEL_SERVING_CONFIG_LABEL,
  parseModelServingConfigMap,
  parseServingPresetConfigMap,
  type ModelServingConfig,
  type ServingPreset,
} from '../lib/servingPresets';

/**
 * Presets change when the chart is upgraded or an operator edits values —
 * not between two opens of the serve dialog. Keep them warm.
 */
const STALE_TIME = 5 * 60 * 1000;

export type ServingPresetsProblem = { installation: string; message: string };

export type InvalidServingPreset = {
  installation: string;
  name: string;
  error: string;
};

export type ServingPresets = {
  /** Discovery or preset reads still in flight. */
  isLoading: boolean;
  /** Installations (in input order) with a usable discovery config — where serving from a preset is possible. */
  installations: string[];
  configFor: (installation: string) => ModelServingConfig | undefined;
  /** Usable presets of an installation, by display name. */
  presetsFor: (installation: string) => ServingPreset[];
  /** Reads that failed (403, unreachable) or a discovery ConfigMap that did not parse. */
  problems: ServingPresetsProblem[];
  /** Preset ConfigMaps that are there but unusable — named, so the operator can fix them. */
  invalidPresets: InvalidServingPreset[];
};

/**
 * The serving presets and discovery config of the installations that have a
 * KServe serving layer, read as ConfigMaps with the user's own RBAC per the
 * agent-platform-standalone `modelServing` contract:
 *
 * 1. the discovery ConfigMap — one labelled
 *    `agent-platform.giantswarm.io/model-serving-config=true`, in whatever
 *    namespace the platform chart was released to (hence a cluster-wide,
 *    label-filtered list rather than a guessed namespace);
 * 2. the presets — the ConfigMaps in the namespace and under the label
 *    selector the discovery config names.
 *
 * An installation without the discovery ConfigMap (chart component off, or
 * an older chart) simply has no presets: the serve flow is not offered there,
 * the read-only Serving view still is.
 */
export function useServingPresets(installations: string[]): ServingPresets {
  const installationsKey = installations.join(',');

  const discoveryOptions = useMemo(
    () =>
      Object.fromEntries(
        installations.map(installation => [
          installation,
          {
            labelSelector: {
              matchingLabels: { [MODEL_SERVING_CONFIG_LABEL]: 'true' },
            },
          },
        ]),
      ),
    // `installations` is a fresh array each render; key on its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installationsKey],
  );
  // Core ConfigMaps have one version; skip API discovery.
  const discovery = useResources(installations, ConfigMap, discoveryOptions, {
    enableDiscovery: false,
    staleTime: STALE_TIME,
  });

  const { configs, configProblems } = useMemo(() => {
    const parsed: Record<string, ModelServingConfig> = {};
    const problems: ServingPresetsProblem[] = [];
    for (const configMap of discovery.resources) {
      if (parsed[configMap.cluster]) {
        // The contract names exactly one; a second is a chart or operator
        // mistake, not something to pick from.
        problems.push({
          installation: configMap.cluster,
          message: `More than one model-serving discovery ConfigMap; ignoring ${configMap.getNamespace()}/${configMap.getName()}.`,
        });
        continue;
      }
      const result = parseModelServingConfigMap(configMap);
      if (result.ok) {
        parsed[configMap.cluster] = result.config;
      } else {
        problems.push({
          installation: configMap.cluster,
          message: `Discovery ConfigMap ${configMap.getNamespace()}/${configMap.getName()}: ${result.error}`,
        });
      }
    }
    for (const error of discovery.errors) {
      if (error.type !== 'incompatibility') {
        problems.push({
          installation: error.cluster,
          message: error.error.message,
        });
      }
    }
    return { configs: parsed, configProblems: problems };
  }, [discovery.resources, discovery.errors]);

  const withConfig = installations.filter(
    installation => configs[installation],
  );
  const withConfigKey = withConfig.join(',');

  const presetOptions = useMemo(
    () =>
      Object.fromEntries(
        withConfig.map(installation => [
          installation,
          {
            namespace: configs[installation].presets.namespace,
            labelSelector: {
              matchingLabels: configs[installation].presets.matchingLabels,
            },
          },
        ]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [withConfigKey, configs],
  );
  const presetLists = useResources(withConfig, ConfigMap, presetOptions, {
    enableDiscovery: false,
    staleTime: STALE_TIME,
  });

  return useMemo<ServingPresets>(() => {
    const presets: Record<string, ServingPreset[]> = {};
    const invalidPresets: InvalidServingPreset[] = [];
    for (const configMap of presetLists.resources) {
      const result = parseServingPresetConfigMap(configMap);
      if (result.ok) {
        (presets[configMap.cluster] ??= []).push(result.preset);
      } else {
        invalidPresets.push({
          installation: configMap.cluster,
          name: result.name,
          error: result.error,
        });
      }
    }
    for (const list of Object.values(presets)) {
      list.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    const problems = [...configProblems];
    for (const error of presetLists.errors) {
      if (error.type !== 'incompatibility') {
        problems.push({
          installation: error.cluster,
          message: error.error.message,
        });
      }
    }

    return {
      isLoading: discovery.isLoading || presetLists.isLoading,
      installations: withConfig,
      configFor: installation => configs[installation],
      presetsFor: installation => presets[installation] ?? [],
      problems,
      invalidPresets,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    withConfigKey,
    configs,
    configProblems,
    discovery.isLoading,
    presetLists.resources,
    presetLists.errors,
    presetLists.isLoading,
  ]);
}
