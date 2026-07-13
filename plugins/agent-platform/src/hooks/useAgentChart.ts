import { useApi, configApiRef } from '@backstage/core-plugin-api';
import { useMemo } from 'react';
import { load } from 'js-yaml';
import {
  useHelmChartTags,
  useHelmChartValuesYaml,
} from '@giantswarm/backstage-plugin-gs';
import { CHART_DEFAULTS } from '../lib/agentDefaults';

export type AgentChart = {
  /** Version to deploy: the latest stable published tag, else the config floor. */
  version: string;
  /** The chart's default `agent.systemMessage` ('' when it can't be resolved). */
  defaultSystemMessage: string;
  isLoading: boolean;
  error: Error | null;
};

/**
 * Resolves the `agent` chart's deploy version and default system prompt from the
 * OCI registry at runtime, so the create flow tracks the published chart rather
 * than hardcoded values.
 *
 * Reuses the gs Helm-chart hooks (the same ones behind the App Deployment
 * scaffolder fields), which own the container-registry + github/raw-content
 * plumbing and its error handling: `useHelmChartTags` → latest stable tag →
 * `useHelmChartValuesYaml` → the chart's values.yaml → `agent.systemMessage`.
 *
 * Everything degrades gracefully: the version falls back to the configured
 * floor and the prompt to '' (the user then keeps the chart's own default).
 */
export function useAgentChart(): AgentChart {
  const configApi = useApi(configApiRef);

  const ociUrl =
    configApi.getOptionalString('agentPlatform.chart.ociUrl') ??
    CHART_DEFAULTS.ociUrl;
  const configVersion =
    configApi.getOptionalString('agentPlatform.chart.version') ??
    CHART_DEFAULTS.version;

  // The gs hooks parse the ref themselves (parseChartRef); they expect it
  // without the oci:// scheme.
  const chartRef = ociUrl.replace(/^oci:\/\//, '');

  const {
    latestStableVersion,
    isLoading: tagsLoading,
    error: tagsError,
  } = useHelmChartTags(chartRef);

  const version = latestStableVersion ?? configVersion;

  const {
    valuesYaml,
    isLoading: valuesLoading,
    error: valuesError,
  } = useHelmChartValuesYaml(chartRef, version);

  const defaultSystemMessage = useMemo(() => {
    if (!valuesYaml) {
      return '';
    }
    try {
      const parsed = load(valuesYaml) as
        { agent?: { systemMessage?: string } } | undefined;
      return parsed?.agent?.systemMessage?.trimEnd() ?? '';
    } catch {
      // A malformed values.yaml shouldn't fail the whole resolution — the
      // version is still valid and the user can write their own prompt.
      return '';
    }
  }, [valuesYaml]);

  return {
    version,
    defaultSystemMessage,
    isLoading: tagsLoading || valuesLoading,
    error: (tagsError as Error) ?? (valuesError as Error) ?? null,
  };
}
