import {
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { load } from 'js-yaml';
import { CHART_DEFAULTS } from '../lib/agentDefaults';

// The chart publishes a link to its values.schema.json as an OCI annotation;
// values.yaml sits next to it. Same annotations the App Deployment flow reads.
const VALUES_SCHEMA_ANNOTATION = 'io.giantswarm.application.values-schema';
const DEPRECATED_VALUES_SCHEMA_ANNOTATION =
  'application.giantswarm.io/values-schema';

export type AgentChart = {
  /** Version to deploy: the latest stable published tag, else the config floor. */
  version: string;
  /** The chart's default `agent.systemMessage` ('' when it can't be resolved). */
  defaultSystemMessage: string;
  isLoading: boolean;
  error: Error | null;
};

/** Splits an `oci://registry/repo/path` URL into registry + repository. */
function parseOciRef(ociUrl: string): { registry: string; repository: string } {
  const ref = ociUrl.replace(/^oci:\/\//, '');
  const slash = ref.indexOf('/');
  return {
    registry: ref.slice(0, slash),
    repository: ref.slice(slash + 1),
  };
}

/**
 * Resolves the `agent` chart's deploy version and default system prompt from the
 * OCI registry at runtime, so the create flow tracks the published chart rather
 * than hardcoded values. Reuses the gs-backend container-registry and
 * github/raw-content endpoints (the same logic the App Deployment scaffolder
 * fields use):
 *
 *   tags → latest stable version → tag manifest → values-schema annotation →
 *   values.yaml → agent.systemMessage
 *
 * Every step degrades gracefully: the version falls back to the configured
 * floor and the prompt to '' (the user then types their own).
 */
export function useAgentChart(): AgentChart {
  const configApi = useApi(configApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const ociUrl =
    configApi.getOptionalString('agentPlatform.chart.ociUrl') ??
    CHART_DEFAULTS.ociUrl;
  const configVersion =
    configApi.getOptionalString('agentPlatform.chart.version') ??
    CHART_DEFAULTS.version;

  const { registry, repository } = parseOciRef(ociUrl);

  const { data, isLoading, error } = useQuery({
    queryKey: ['agent-platform', 'chart', registry, repository],
    queryFn: async () => {
      const baseUrl = await discoveryApi.getBaseUrl('gs');

      // 1. Latest stable published tag (fall back to the configured floor).
      let version = configVersion;
      const tagsRes = await fetchApi.fetch(
        `${baseUrl}/container-registry/tags?${new URLSearchParams({
          registry,
          repository,
        })}`,
      );
      if (tagsRes.ok) {
        const tags = (await tagsRes.json()) as {
          latestStableVersion: string | null;
        };
        if (tags.latestStableVersion) {
          version = tags.latestStableVersion;
        }
      }

      // 2. Tag manifest → values-schema annotation → values.yaml URL.
      const manifestRes = await fetchApi.fetch(
        `${baseUrl}/container-registry/tag-manifest?${new URLSearchParams({
          registry,
          repository,
          tag: version,
        })}`,
      );
      let defaultSystemMessage = '';
      if (manifestRes.ok) {
        const manifest = (await manifestRes.json()) as {
          annotations: Record<string, string>;
        };
        const schemaUrl =
          manifest.annotations[VALUES_SCHEMA_ANNOTATION] ??
          manifest.annotations[DEPRECATED_VALUES_SCHEMA_ANNOTATION];
        const valuesUrl = schemaUrl?.replace(
          'values.schema.json',
          'values.yaml',
        );

        // 3. Fetch values.yaml (via the GitHub proxy for private-repo auth when
        // it lives on raw.githubusercontent.com) and read agent.systemMessage.
        if (valuesUrl) {
          const valuesText = await fetchValues(baseUrl, fetchApi, valuesUrl);
          if (valuesText) {
            const parsed = load(valuesText) as
              { agent?: { systemMessage?: string } } | undefined;
            defaultSystemMessage =
              parsed?.agent?.systemMessage?.trimEnd() ?? '';
          }
        }
      }

      return { version, defaultSystemMessage };
    },
  });

  return {
    version: data?.version ?? configVersion,
    defaultSystemMessage: data?.defaultSystemMessage ?? '',
    isLoading,
    error: (error as Error) ?? null,
  };
}

async function fetchValues(
  baseUrl: string,
  fetchApi: { fetch: typeof fetch },
  url: string,
): Promise<string | null> {
  if (url.startsWith('https://raw.githubusercontent.com/')) {
    const res = await fetchApi.fetch(
      `${baseUrl}/github/raw-content?${new URLSearchParams({ url })}`,
    );
    return res.ok ? res.text() : null;
  }
  const res = await fetch(url);
  return res.ok ? res.text() : null;
}
