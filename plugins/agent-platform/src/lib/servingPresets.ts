// The serving-preset contract published by agent-platform-standalone's
// `modelServing` component (giantswarm/agent-platform-standalone#69), as the
// portal reads it back from the cluster: a discovery ConfigMap saying where
// InferenceServices go and what defaults they get, and one ConfigMap per
// curated preset — the reviewed recipe (flags, chat template, memory numbers)
// for serving one model. The portal composes InferenceServices from these and
// never invents vLLM flags of its own (`serveModel.ts`).
//
// Everything here is pure: parsing and normalising the two documents. The
// hook that lists the ConfigMaps is `hooks/useServingPresets.ts`.

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

/** Label every published preset ConfigMap carries (`=true`). */
export const SERVING_PRESET_LABEL =
  'agent-platform.giantswarm.io/serving-preset';
/** Key of the `ServingPreset` document inside a preset ConfigMap. */
export const SERVING_PRESET_KEY = 'preset.yaml';
/**
 * Label naming the preset, on its ConfigMap and — per the chart's composition
 * recipe — on every InferenceService created from it.
 */
export const AGENT_PLATFORM_PRESET_LABEL =
  'agent-platform.giantswarm.io/preset';
/** `shipped` (from the chart's files) or `values` (an operator's own). */
export const AGENT_PLATFORM_PRESET_SOURCE_LABEL =
  'agent-platform.giantswarm.io/preset-source';

/** Where InferenceServices go and what every one of them inherits. */
export type ModelServingConfig = {
  /** Installation the config was read from. */
  installation: string;
  /** Namespace InferenceServices are created in. */
  namespace: string;
  /** The `ClusterServingRuntime` a preset without one of its own runs on. */
  runtime: string;
  /** Extended resource a GPU is requested as, e.g. `nvidia.com/gpu`. */
  gpuResourceName: string;
  /** RuntimeClass of the predictor pods; `undefined` leaves the cluster default. */
  runtimeClassName?: string;
  /** Node selector every predictor gets; a preset's is merged on top. */
  nodeSelector: Record<string, string>;
  deploymentStrategyType?: string;
  /** Request timeout KServe writes into the predictor route, in seconds. */
  timeoutSeconds?: number;
  cache: {
    enabled: boolean;
    claimName?: string;
    mountPath?: string;
    /** Whether Kyverno policies redirect the storage-initializer into the cache at admission. */
    redirectPolicy: boolean;
  };
  presets: {
    /** Namespace the preset ConfigMaps live in (the release namespace). */
    namespace: string;
    /** Equality label selector of the preset ConfigMaps. */
    matchingLabels: Record<string, string>;
    /** Names the chart published, for cross-checking. */
    names: string[];
  };
};

export type ServingPresetEnvVar = {
  name: string;
  value?: string;
  valueFrom?: unknown;
};

/** A published `ServingPreset`, normalised: every default the schema names is filled in. */
export type ServingPreset = {
  /** Installation the preset was read from. */
  installation: string;
  /** DNS-1123 label (≤ 30 chars); the default InferenceService name. */
  name: string;
  source?: string;
  displayName: string;
  /** Operator notes (markdown). */
  description?: string;
  model: {
    /** Hugging Face repository (`owner/name`). */
    id: string;
    /** `predictor.model.storageUri` — `hf://…`, `pvc://…`, … */
    storageUri: string;
    /** `predictor.model.modelFormat.name`. */
    format: string;
    contextLength?: number;
    capabilities: string[];
    license?: string;
  };
  /** The `ClusterServingRuntime`; falls back to the config's when absent. */
  runtime?: string;
  /** vLLM arguments, complete and literal; ends with `--chat-template=…` when a template is set. */
  args: string[];
  env: ServingPresetEnvVar[];
  /** The chat template's ConfigMap (serving namespace) and where the predictor mounts it. */
  chatTemplate?: { configMap: string; key: string; mountPath: string };
  resources: {
    gpus: number;
    requests: Record<string, string>;
    limits: Record<string, string>;
  };
  /** What the fit check compares against a node's memory: `weightsGiB + overheadGiB`. */
  requirements: { weightsGiB: number; overheadGiB: number };
  scheduling: {
    nodeSelector: Record<string, string>;
    tolerations: Record<string, unknown>[];
  };
  /** Extra predictor fields copied verbatim (they win over the config's defaults). */
  predictor: Record<string, unknown>;
};

/** Default `overheadGiB` when a preset does not state one (the schema's default). */
export const DEFAULT_OVERHEAD_GIB = 30;

const DNS_LABEL_30 = /^[a-z0-9]([-a-z0-9]{0,28}[a-z0-9])?$/;

const quantityRecord = z.record(z.string(), z.union([z.string(), z.number()]));

const modelServingConfigSchema = z.object({
  apiVersion: z.literal(AGENT_PLATFORM_API_VERSION),
  kind: z.literal('ModelServingConfig'),
  spec: z.object({
    namespace: z.string().min(1),
    runtime: z.string().min(1),
    gpuResourceName: z.string().min(1).optional(),
    runtimeClassName: z.string().nullish(),
    nodeSelector: z.record(z.string(), z.string()).nullish(),
    deploymentStrategyType: z.string().nullish(),
    timeoutSeconds: z.number().int().positive().nullish(),
    cache: z
      .object({
        enabled: z.boolean(),
        claimName: z.string().nullish(),
        mountPath: z.string().nullish(),
        redirectPolicy: z.boolean().nullish(),
      })
      .nullish(),
    presets: z.object({
      namespace: z.string().min(1),
      labelSelector: z.string().nullish(),
      names: z.array(z.string()).nullish(),
    }),
  }),
});

const servingPresetSchema = z.object({
  apiVersion: z.literal(AGENT_PLATFORM_API_VERSION),
  kind: z.literal('ServingPreset'),
  metadata: z.object({ name: z.string().regex(DNS_LABEL_30) }),
  spec: z.object({
    displayName: z.string().min(1),
    description: z.string().nullish(),
    model: z.object({
      id: z.string().min(1),
      storageUri: z.string().regex(/^(hf|pvc|s3|gs|oci|https?):\/\/.+/),
      format: z.string().min(1).nullish(),
      contextLength: z.number().int().positive().nullish(),
      capabilities: z.array(z.string()).nullish(),
      license: z.string().nullish(),
    }),
    runtime: z.string().nullish(),
    args: z.array(z.string()).nullish(),
    env: z
      .array(
        z.object({
          name: z.string().min(1),
          value: z.string().nullish(),
          valueFrom: z.unknown().optional(),
        }),
      )
      .nullish(),
    chatTemplate: z
      .object({
        // Only the *published* form is usable from here: `file`/`content` are
        // authoring inputs the chart resolves into a ConfigMap.
        configMap: z.string().min(1),
        key: z.string().min(1).nullish(),
        mountPath: z.string().min(1).nullish(),
      })
      .nullish(),
    resources: z
      .object({
        gpus: z.number().int().min(0).nullish(),
        requests: quantityRecord.nullish(),
        limits: quantityRecord.nullish(),
      })
      .nullish(),
    requirements: z.object({
      weightsGiB: z.number().positive(),
      overheadGiB: z.number().min(0).nullish(),
    }),
    scheduling: z
      .object({
        nodeSelector: z.record(z.string(), z.string()).nullish(),
        tolerations: z.array(z.record(z.string(), z.unknown())).nullish(),
      })
      .nullish(),
    predictor: z.record(z.string(), z.unknown()).nullish(),
  }),
});

/**
 * The equality terms of a Kubernetes label selector (`a=b,c=d`), as the
 * `matchingLabels` the resource hooks speak. Set-based terms (`in`, `!=`, a
 * bare key) are not expressible there and are dropped.
 */
export function parseEqualitySelector(
  selector: string | undefined | null,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const term of (selector ?? '').split(',')) {
    const match = /^\s*([^=!\s]+)\s*={1,2}\s*([^\s]*)\s*$/.exec(term);
    if (match) {
      labels[match[1]] = match[2];
    }
  }
  return labels;
}

function stringifyQuantities(
  record: Record<string, string | number> | null | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record ?? {}).map(([key, value]) => [key, String(value)]),
  );
}

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

function loadDocument(
  configMap: ConfigMap,
  key: string,
): { ok: true; doc: unknown } | { ok: false; error: string } {
  const text = configMap.getData()?.[key];
  if (text === undefined) {
    return { ok: false, error: `ConfigMap has no "${key}" key` };
  }
  try {
    return { ok: true, doc: load(text) };
  } catch (e) {
    return {
      ok: false,
      error: `"${key}" is not valid YAML: ${(e as Error).message}`,
    };
  }
}

export type ModelServingConfigResult =
  { ok: true; config: ModelServingConfig } | { ok: false; error: string };

/** The discovery ConfigMap → its normalised {@link ModelServingConfig}. */
export function parseModelServingConfigMap(
  configMap: ConfigMap,
): ModelServingConfigResult {
  const loaded = loadDocument(configMap, MODEL_SERVING_CONFIG_KEY);
  if (!loaded.ok) {
    return loaded;
  }
  const parsed = modelServingConfigSchema.safeParse(loaded.doc);
  if (!parsed.success) {
    return {
      ok: false,
      error: `not a ModelServingConfig: ${issueSummary(parsed.error)}`,
    };
  }
  const { spec } = parsed.data;
  const matchingLabels = parseEqualitySelector(spec.presets.labelSelector);
  return {
    ok: true,
    config: {
      installation: configMap.cluster,
      namespace: spec.namespace,
      runtime: spec.runtime,
      gpuResourceName: spec.gpuResourceName ?? 'nvidia.com/gpu',
      runtimeClassName: spec.runtimeClassName || undefined,
      nodeSelector: spec.nodeSelector ?? {},
      deploymentStrategyType: spec.deploymentStrategyType || undefined,
      timeoutSeconds: spec.timeoutSeconds ?? undefined,
      cache: {
        enabled: spec.cache?.enabled ?? false,
        claimName: spec.cache?.claimName ?? undefined,
        mountPath: spec.cache?.mountPath ?? undefined,
        redirectPolicy: spec.cache?.redirectPolicy ?? false,
      },
      presets: {
        namespace: spec.presets.namespace,
        matchingLabels:
          Object.keys(matchingLabels).length > 0
            ? matchingLabels
            : { [SERVING_PRESET_LABEL]: 'true' },
        names: spec.presets.names ?? [],
      },
    },
  };
}

export type ServingPresetResult =
  | { ok: true; preset: ServingPreset }
  | { ok: false; name: string; error: string };

/**
 * One preset ConfigMap → its normalised {@link ServingPreset}. A ConfigMap
 * that does not hold a usable published preset is reported by name (from its
 * label, else the ConfigMap's) so the UI can say which one is broken instead
 * of silently offering fewer presets.
 */
export function parseServingPresetConfigMap(
  configMap: ConfigMap,
): ServingPresetResult {
  const labels = configMap.getLabels() ?? {};
  const name = labels[AGENT_PLATFORM_PRESET_LABEL] ?? configMap.getName();
  const loaded = loadDocument(configMap, SERVING_PRESET_KEY);
  if (!loaded.ok) {
    return { ok: false, name, error: loaded.error };
  }
  const parsed = servingPresetSchema.safeParse(loaded.doc);
  if (!parsed.success) {
    return {
      ok: false,
      name,
      error: `not a published ServingPreset: ${issueSummary(parsed.error)}`,
    };
  }
  const { metadata, spec } = parsed.data;
  return {
    ok: true,
    preset: {
      installation: configMap.cluster,
      name: metadata.name,
      source: labels[AGENT_PLATFORM_PRESET_SOURCE_LABEL],
      displayName: spec.displayName,
      description: spec.description ?? undefined,
      model: {
        id: spec.model.id,
        storageUri: spec.model.storageUri,
        format: spec.model.format ?? 'vLLM',
        contextLength: spec.model.contextLength ?? undefined,
        capabilities: spec.model.capabilities ?? [],
        license: spec.model.license ?? undefined,
      },
      runtime: spec.runtime || undefined,
      args: spec.args ?? [],
      env: (spec.env ?? []).map(entry => ({
        name: entry.name,
        ...(entry.value !== undefined && entry.value !== null
          ? { value: entry.value }
          : {}),
        ...(entry.valueFrom !== undefined
          ? { valueFrom: entry.valueFrom }
          : {}),
      })),
      chatTemplate: spec.chatTemplate
        ? {
            configMap: spec.chatTemplate.configMap,
            key: spec.chatTemplate.key ?? 'chat-template.jinja',
            mountPath: spec.chatTemplate.mountPath ?? '/mnt/chat-template',
          }
        : undefined,
      resources: {
        gpus: spec.resources?.gpus ?? 1,
        requests: stringifyQuantities(spec.resources?.requests),
        limits: stringifyQuantities(spec.resources?.limits),
      },
      requirements: {
        weightsGiB: spec.requirements.weightsGiB,
        overheadGiB: spec.requirements.overheadGiB ?? DEFAULT_OVERHEAD_GIB,
      },
      scheduling: {
        nodeSelector: spec.scheduling?.nodeSelector ?? {},
        tolerations: spec.scheduling?.tolerations ?? [],
      },
      predictor: spec.predictor ?? {},
    },
  };
}

/** Memory a preset needs on the serving node: weights plus runtime headroom. */
export function presetRequiredGiB(preset: ServingPreset): number {
  return preset.requirements.weightsGiB + preset.requirements.overheadGiB;
}
