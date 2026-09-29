// The model-serving discovery document the platform's connectivity chart
// publishes (`giantswarm/agent-platform`, `agent-platform-connectivity`,
// templates/model-serving/config.yaml): where the LLMInferenceServices go,
// which defaults they get, and the models Gateway their routes attach to. The
// portal reads it back from the cluster for what its KServe serving source
// needs — the resource name accelerators go by, the Gateway a client of a
// served model addresses; composing a served model is model-manager's job
// (`load_model`), never the portal's.
//
// Everything here is pure: parsing and normalising the document. The hook
// that lists the ConfigMap is `hooks/useModelServingConfigs.ts`.

import { load } from 'js-yaml';
import { z } from 'zod';
import type { ConfigMap } from '@giantswarm/backstage-plugin-kubernetes-react';

export const AGENT_PLATFORM_API_VERSION =
  'agent-platform.giantswarm.io/v1alpha1';

/** Label of the discovery ConfigMap (`=true`), in the platform release namespace. */
export const MODEL_SERVING_CONFIG_LABEL =
  'agent-platform.giantswarm.io/model-serving-config';
/** Key of the `ModelServingConfig` document inside the discovery ConfigMap. */
export const MODEL_SERVING_CONFIG_KEY = 'config.yaml';
/**
 * Label naming the preset an LLMInferenceService was composed from —
 * model-manager puts it on every object it composes.
 */
export const AGENT_PLATFORM_PRESET_LABEL =
  'agent-platform.giantswarm.io/preset';

/** The default extended resource a GPU is requested as when the document names none. */
export const DEFAULT_GPU_RESOURCE_NAME = 'nvidia.com/gpu';

/** Where the LLMInferenceServices go and what a client of one addresses. */
export type ModelServingConfig = {
  /** Installation the config was read from. */
  installation: string;
  /** Namespace the LLMInferenceServices are created in. */
  namespace: string;
  /** Extended resource a GPU is requested as, e.g. `nvidia.com/gpu`. */
  gpuResourceName: string;
  /**
   * The models Gateway every LLMInferenceService's route attaches to, when the
   * chart renders one: its public origin (`https://models.<domain>`) and the
   * path a served model answers on (`/<namespace>/<model>/v1`). Absent when
   * the installation serves models on their workload Services alone.
   */
  gateway?: { endpoint: string; pathConvention?: string };
};

const modelServingConfigSchema = z.object({
  apiVersion: z.literal(AGENT_PLATFORM_API_VERSION),
  kind: z.literal('ModelServingConfig'),
  spec: z.object({
    namespace: z.string().min(1),
    gpuResourceName: z.string().min(1).optional(),
    gateway: z
      .object({
        enabled: z.boolean(),
        endpoint: z.string().nullish(),
        pathConvention: z.string().nullish(),
      })
      .nullish(),
  }),
});

function issueSummary(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map(issue =>
      issue.path.length
        ? `${issue.path.join('.')}: ${issue.message}`
        : issue.message,
    )
    .join('; ');
}

export type ModelServingConfigResult =
  { ok: true; config: ModelServingConfig } | { ok: false; error: string };

/** The discovery ConfigMap → its normalised {@link ModelServingConfig}. */
export function parseModelServingConfigMap(
  configMap: ConfigMap,
): ModelServingConfigResult {
  const text = configMap.getData()?.[MODEL_SERVING_CONFIG_KEY];
  if (text === undefined) {
    return {
      ok: false,
      error: `ConfigMap has no "${MODEL_SERVING_CONFIG_KEY}" key`,
    };
  }
  let doc: unknown;
  try {
    doc = load(text);
  } catch (e) {
    return {
      ok: false,
      error: `"${MODEL_SERVING_CONFIG_KEY}" is not valid YAML: ${(e as Error).message}`,
    };
  }
  const parsed = modelServingConfigSchema.safeParse(doc);
  if (!parsed.success) {
    return {
      ok: false,
      error: `not a ModelServingConfig: ${issueSummary(parsed.error)}`,
    };
  }
  const { spec } = parsed.data;
  const gatewayEndpoint = spec.gateway?.enabled
    ? spec.gateway.endpoint?.trim().replace(/\/+$/, '')
    : undefined;
  return {
    ok: true,
    config: {
      installation: configMap.cluster,
      namespace: spec.namespace,
      gpuResourceName: spec.gpuResourceName ?? DEFAULT_GPU_RESOURCE_NAME,
      gateway: gatewayEndpoint
        ? {
            endpoint: gatewayEndpoint,
            pathConvention: spec.gateway?.pathConvention ?? undefined,
          }
        : undefined,
    },
  };
}
