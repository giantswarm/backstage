import { useMemo } from 'react';
import {
  ConfigMap,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  MODEL_SERVING_CONFIG_LABEL,
  parseModelServingConfigMap,
  type ModelServingConfig,
} from '../lib/modelServingConfig';

/**
 * The document changes when the chart is upgraded or an operator edits values
 * — not between two renders. Keep it warm.
 */
const STALE_TIME = 5 * 60 * 1000;

export type ModelServingConfigProblem = {
  installation: string;
  message: string;
};

/** The discovery configs of a set of installations. */
export type ModelServingConfigs = {
  /** Discovery reads still in flight. */
  isLoading: boolean;
  /** Per installation, its parsed discovery config; absent where there is none (or it did not parse). */
  configs: Record<string, ModelServingConfig>;
  /** Reads that failed (403, unreachable) or a discovery ConfigMap that did not parse. */
  problems: ModelServingConfigProblem[];
};

/**
 * The model-serving discovery config of each installation, read as a
 * ConfigMap with the user's own RBAC per the connectivity chart's
 * `modelServing` contract: one labelled
 * `agent-platform.giantswarm.io/model-serving-config=true`, in whatever
 * namespace the platform chart was released to (hence a cluster-wide,
 * label-filtered list rather than a guessed namespace).
 *
 * An installation without the document (serving component off, or no serving
 * slice) simply has no config: the KServe source then counts accelerators by
 * the known resource names and knows no models Gateway there.
 */
export function useModelServingConfigs(
  installations: string[],
): ModelServingConfigs {
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

  return useMemo<ModelServingConfigs>(() => {
    const configs: Record<string, ModelServingConfig> = {};
    const problems: ModelServingConfigProblem[] = [];
    for (const configMap of discovery.resources) {
      if (configs[configMap.cluster]) {
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
        configs[configMap.cluster] = result.config;
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
    return { isLoading: discovery.isLoading, configs, problems };
  }, [discovery.resources, discovery.errors, discovery.isLoading]);
}
