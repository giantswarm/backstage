// Everything pure about managing kagent ModelConfigs: the provider contract
// (canonical key-secret names), the create/edit form model with its
// validation, and the manifest/patch composition the save mutation applies.
//
// The key-secret conventions deliberately match agentlab's `platform.
// extraModels` (giantswarm/agentlab#44), so models provisioned by either tool
// look the same on the cluster: the Secret is named `kagent-<model name>`,
// lives in the ModelConfig's namespace, and its one key is the provider's
// canonical env-var name.

import {
  BACKSTAGE_FIELD_MANAGER,
  ModelConfig,
  readProvenance,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Where portal-created ModelConfigs (and their key Secrets) go: the namespace
 * the kagent chart installs its runtime and default ModelConfig into. Agents
 * are composed by agent-manager and deployed into their ModelConfig's
 * namespace, so this is also where portal-created agents land.
 */
export const MODEL_CONFIG_NAMESPACE = 'kagent';

/** Providers the create/edit form speaks. A subset of the CRD's enum: the
 * others (AzureOpenAI, Bedrock, VertexAI variants, SAPAICore) carry provider
 * blocks this form has no fields for, so CRs using them render read-only and
 * stay kubectl territory. */
export type ModelProvider = 'OpenAI' | 'Anthropic' | 'Gemini' | 'Ollama';

export const MODEL_PROVIDER_OPTIONS: {
  id: ModelProvider;
  label: string;
  description: string;
}[] = [
  {
    id: 'OpenAI',
    label: 'OpenAI (or compatible)',
    description:
      'OpenAI itself, or any OpenAI-compatible endpoint: vLLM, llama.cpp, OpenRouter, …',
  },
  {
    id: 'Anthropic',
    label: 'Anthropic',
    description: 'Claude models via the Anthropic API.',
  },
  {
    id: 'Gemini',
    label: 'Gemini',
    description: 'Gemini models via the Google AI API.',
  },
  {
    id: 'Ollama',
    label: 'Ollama',
    description: 'Models served by an Ollama host. No API key involved.',
  },
];

export function isSupportedProvider(
  provider: string | undefined,
): provider is ModelProvider {
  return MODEL_PROVIDER_OPTIONS.some(option => option.id === provider);
}

/**
 * The one key inside a model's Secret, per provider. Not configurable: the
 * kagent controller injects the Secret's key as an env var of the same name
 * into agent pods, and the ADK runtime looks up exactly these canonical
 * names. Ollama is keyless — no Secret at all.
 */
export const PROVIDER_SECRET_KEYS: Record<ModelProvider, string | undefined> = {
  OpenAI: 'OPENAI_API_KEY',
  Anthropic: 'ANTHROPIC_API_KEY',
  Gemini: 'GOOGLE_API_KEY',
  Ollama: undefined,
};

/**
 * What the Secret holds when no API key is entered: the endpoint needs none
 * (a local vLLM, say). The Secret still has to exist with the provider's
 * canonical key: the ADK runtime requires the env var at startup, so an agent
 * pod without it crashloops even against an endpoint that never checks the
 * value.
 */
export const PLACEHOLDER_API_KEY = 'giantswarm-backstage-placeholder';

/** The Secret a portal-created model's key lives in (agentlab convention). */
export function keySecretName(modelName: string): string {
  return `kagent-${modelName}`;
}

/** The annotation `ModelConfig.getDisplayName()` prefers. */
const DISPLAY_NAME_ANNOTATION = 'ui.giantswarm.io/display-name';
const MANAGED_BY_LABEL = 'app.kubernetes.io/managed-by';

/**
 * The create/edit form's model. `apiKey` is write-only and optional: it is
 * never read back from the cluster; empty means "the endpoint needs none" on
 * create and "leave the existing key alone" on edit (see {@link planKeySecret}).
 */
export type ModelConfigFormValues = {
  /** ModelConfig CR name; immutable after creation. */
  name: string;
  /** Optional friendly name (the display-name annotation). */
  displayName: string;
  provider: ModelProvider;
  /** Provider model id, e.g. `claude-sonnet-4-6` or `qwen3-8-27b`. */
  model: string;
  /**
   * Base URL (OpenAI/Anthropic; empty = the provider's default endpoint) or
   * Ollama host. Unused for Gemini.
   */
  endpoint: string;
  /** `spec.tls.disableVerify`, for self-signed lab endpoints. */
  insecureSkipTlsVerify: boolean;
  /** Write-only, optional. See {@link planKeySecret} for what empty means. */
  apiKey: string;
};

export const INITIAL_MODEL_CONFIG_FORM: ModelConfigFormValues = {
  name: '',
  displayName: '',
  provider: 'OpenAI',
  model: '',
  endpoint: '',
  insecureSkipTlsVerify: false,
  apiKey: '',
};

/** Whether the endpoint field applies to this provider at all. */
export function providerHasEndpoint(provider: ModelProvider): boolean {
  return provider !== 'Gemini';
}

// RFC1123 DNS label: the name becomes the ModelConfig CR name (and the key
// Secret's name suffix), so it must be a valid k8s object name.
const DNS_LABEL_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

/** The model form's fields a validation problem can belong to. */
export type ModelConfigField = 'displayName' | 'name' | 'model' | 'endpoint';

export type ModelConfigFieldErrors = Partial<Record<ModelConfigField, string>>;

/** The fields in form order: the order {@link validateModelConfigForm} lists. */
const MODEL_CONFIG_FIELDS: readonly ModelConfigField[] = [
  'displayName',
  'name',
  'model',
  'endpoint',
];

/**
 * Validation problems by the field each belongs to; empty when the form can
 * be saved. The form shows each on its own field.
 *
 * The display name is required on create only: the technical name is filled
 * in from it, and it is what people see when they choose a model. An existing
 * model without one (made with kubectl) stays saveable as it is. The API key
 * is never required — an empty one means the endpoint needs none.
 */
export function modelConfigFieldErrors(
  values: ModelConfigFormValues,
  options: { isEdit: boolean } = { isEdit: false },
): ModelConfigFieldErrors {
  const errors: ModelConfigFieldErrors = {};

  if (!options.isEdit && !values.displayName.trim()) {
    errors.displayName = 'Name is required';
  }

  if (!values.name.trim()) {
    errors.name = 'Technical name is required';
  } else if (values.name.length > 63 || !DNS_LABEL_PATTERN.test(values.name)) {
    errors.name =
      'Technical name must be lowercase letters, numbers and hyphens (max 63 characters), e.g. qwen3-vllm';
  }

  if (!values.model.trim()) {
    errors.model = 'Model is required';
  }

  if (values.provider === 'Ollama' && !values.endpoint.trim()) {
    errors.endpoint = 'Host is required for Ollama';
  } else if (
    values.endpoint.trim() &&
    !/^https?:\/\//.test(values.endpoint.trim())
  ) {
    errors.endpoint = 'The endpoint must be an http:// or https:// URL';
  }

  return errors;
}

/**
 * Validation problems, in form order; empty when the form can be saved. The
 * list form of {@link modelConfigFieldErrors}, for a summary of them all.
 */
export function validateModelConfigForm(
  values: ModelConfigFormValues,
  options: { isEdit: boolean } = { isEdit: false },
): string[] {
  const errors = modelConfigFieldErrors(values, options);
  return MODEL_CONFIG_FIELDS.map(field => errors[field]).filter(
    (error): error is string => Boolean(error),
  );
}

/**
 * What the save mutation should do about the model's key Secret.
 *
 * - `none` — the provider is keyless (Ollama): no Secret involved.
 * - `keep` — edit with nothing new entered and the provider unchanged: leave
 *   the referenced Secret alone.
 * - `write` — create or replace the conventional Secret with this one key.
 *   Always the portal's own `kagent-<name>`, never a foreign Secret the CR
 *   may currently reference — the portal only ever writes Secrets it owns.
 *
 * The key is optional, and an empty one means the endpoint needs none: the
 * Secret gets {@link PLACEHOLDER_API_KEY} (the ModelConfig spec is the same
 * either way — it references the Secret and its canonical key). That is what
 * an empty key does on create, and on an edit that changes the provider: the
 * existing Secret holds the old provider's canonical key, which the new
 * provider's runtime does not read, and the portal never reads a key back to
 * carry it over.
 */
export type KeySecretPlan =
  | { action: 'none' }
  | { action: 'keep' }
  | { action: 'write'; name: string; key: string; value: string };

export function planKeySecret(
  values: ModelConfigFormValues,
  options: { isEdit: boolean; originalProvider?: string } = { isEdit: false },
): KeySecretPlan {
  const canonicalKey = PROVIDER_SECRET_KEYS[values.provider];
  if (!canonicalKey) {
    return { action: 'none' };
  }

  // Surrounding whitespace is never part of a key, and a pasted one often
  // carries a trailing newline or space.
  const apiKey = values.apiKey.trim();
  if (
    options.isEdit &&
    !apiKey &&
    options.originalProvider === values.provider
  ) {
    // Nothing new entered, and the stored Secret is still the provider's.
    return { action: 'keep' };
  }

  return {
    action: 'write',
    name: keySecretName(values.name),
    key: canonicalKey,
    value: apiKey || PLACEHOLDER_API_KEY,
  };
}

/**
 * Whether the edit form holds anything to save: a field differs from what it
 * started from, or a key was entered (the key field always starts empty).
 */
export function modelConfigFormChanged(
  values: ModelConfigFormValues,
  initial: ModelConfigFormValues,
): boolean {
  if (values.apiKey.trim()) {
    return true;
  }
  return (
    values.displayName.trim() !== initial.displayName.trim() ||
    values.provider !== initial.provider ||
    values.model.trim() !== initial.model.trim() ||
    values.endpoint.trim() !== initial.endpoint.trim() ||
    values.insecureSkipTlsVerify !== initial.insecureSkipTlsVerify
  );
}

/** The provider-specific endpoint block, or `undefined` when none applies. */
function endpointBlock(
  values: ModelConfigFormValues,
): { field: 'openAI' | 'anthropic' | 'ollama'; block: object } | undefined {
  const endpoint = values.endpoint.trim();
  if (values.provider === 'Ollama') {
    return { field: 'ollama', block: { host: endpoint } };
  }
  if (!endpoint) {
    return undefined;
  }
  if (values.provider === 'Anthropic') {
    return { field: 'anthropic', block: { baseUrl: endpoint } };
  }
  if (values.provider === 'OpenAI') {
    return { field: 'openAI', block: { baseUrl: endpoint } };
  }
  return undefined;
}

/** The Secret manifest a `write` plan creates when none exists yet. */
export function buildKeySecretManifest(
  plan: Extract<KeySecretPlan, { action: 'write' }>,
  namespace: string,
): Record<string, unknown> {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: plan.name,
      namespace,
      labels: { [MANAGED_BY_LABEL]: BACKSTAGE_FIELD_MANAGER },
    },
    type: 'Opaque',
    stringData: { [plan.key]: plan.value },
  };
}

/**
 * The merge patch a `write` plan applies when the Secret already exists.
 * `data: null` clears every previous key first, so a provider switch does not
 * leave the old provider's canonical key lying around next to the new one.
 */
export function buildKeySecretPatch(
  plan: Extract<KeySecretPlan, { action: 'write' }>,
): Record<string, unknown> {
  return {
    data: null,
    stringData: { [plan.key]: plan.value },
  };
}

/** The full ModelConfig manifest for a create. */
export function buildModelConfigManifest(
  values: ModelConfigFormValues,
  plan: KeySecretPlan,
  namespace: string,
): Record<string, unknown> {
  const spec: Record<string, unknown> = {
    provider: values.provider,
    model: values.model.trim(),
  };

  if (plan.action === 'write') {
    spec.apiKeySecret = plan.name;
    spec.apiKeySecretKey = plan.key;
  }

  const endpoint = endpointBlock(values);
  if (endpoint) {
    spec[endpoint.field] = endpoint.block;
  }

  if (values.insecureSkipTlsVerify) {
    spec.tls = { disableVerify: true };
  }

  const displayName = values.displayName.trim();

  return {
    apiVersion: `${ModelConfig.group}/${ModelConfig.apiVersion}`,
    kind: ModelConfig.kind,
    metadata: {
      name: values.name.trim(),
      namespace,
      // Marks portal-created models as ours, which is what keeps them editable
      // here — see modelConfigOwner.
      labels: { [MANAGED_BY_LABEL]: BACKSTAGE_FIELD_MANAGER },
      ...(displayName
        ? { annotations: { [DISPLAY_NAME_ANNOTATION]: displayName } }
        : {}),
    },
    spec,
  };
}

/**
 * The merge patch an edit applies to an existing ModelConfig.
 *
 * Fields this form does not manage are left to their owners, so the patch is
 * surgical: the provider blocks of the *other* providers are `null`ed (a
 * provider switch must not leave `openAI.baseUrl` behind for a now-Anthropic
 * config), while inside the current provider's block only the managed field
 * is written — a hand-set `openAI.maxTokens` survives an endpoint edit.
 */
export function buildModelConfigPatch(
  values: ModelConfigFormValues,
  plan: KeySecretPlan,
  original: ModelConfig,
): Record<string, unknown> {
  const endpoint = endpointBlock(values);

  const providerBlocks: Record<string, unknown> = {
    openAI: null,
    anthropic: null,
    ollama: null,
  };
  if (endpoint) {
    providerBlocks[endpoint.field] = endpoint.block;
  } else if (values.provider === 'OpenAI') {
    // Provider unchanged but the custom base URL was cleared: drop only the
    // managed field rather than the whole block.
    providerBlocks.openAI = { baseUrl: null };
  } else if (values.provider === 'Anthropic') {
    providerBlocks.anthropic = { baseUrl: null };
  }

  let apiKeySecret: string | null;
  let apiKeySecretKey: string | null;
  if (plan.action === 'write') {
    apiKeySecret = plan.name;
    apiKeySecretKey = plan.key;
  } else if (plan.action === 'keep') {
    apiKeySecret = original.getApiKeySecret() ?? null;
    apiKeySecretKey = original.getApiKeySecretKey() ?? null;
  } else {
    apiKeySecret = null;
    apiKeySecretKey = null;
  }

  const displayName = values.displayName.trim();

  return {
    metadata: {
      annotations: {
        [DISPLAY_NAME_ANNOTATION]: displayName || null,
      },
    },
    spec: {
      provider: values.provider,
      model: values.model.trim(),
      apiKeySecret,
      apiKeySecretKey,
      ...providerBlocks,
      // Only the managed field: a hand-set custom CA bundle survives.
      tls: { disableVerify: values.insecureSkipTlsVerify ? true : null },
    },
  };
}

/**
 * Prefill for the edit form. `undefined` when the CR's provider is not one
 * this form speaks — the model then offers no edit.
 *
 * `apiKey` always seeds empty (write-only): whether the referenced Secret
 * holds a real key or the placeholder is not readable from the CR, and does
 * not need to be — leaving the field empty keeps the Secret as it is.
 */
export function modelConfigFormValues(
  modelConfig: ModelConfig,
): ModelConfigFormValues | undefined {
  const provider = modelConfig.getProvider();
  if (!isSupportedProvider(provider)) {
    return undefined;
  }

  let endpoint: string | undefined;
  if (provider === 'Ollama') {
    endpoint = modelConfig.getOllama()?.host;
  } else if (provider === 'Anthropic') {
    endpoint = modelConfig.getAnthropic()?.baseUrl;
  } else {
    endpoint = modelConfig.getOpenAI()?.baseUrl;
  }

  const displayName =
    modelConfig.getAnnotations()?.[DISPLAY_NAME_ANNOTATION] ?? '';

  return {
    name: modelConfig.getName(),
    displayName,
    provider,
    model: modelConfig.getModel() ?? '',
    endpoint: endpoint ?? '',
    insecureSkipTlsVerify: modelConfig.getTls()?.disableVerify === true,
    apiKey: '',
  };
}

/**
 * Who owns this ModelConfig, when it is not the portal: a human-readable name
 * for the tool whose reconciler would fight portal edits, or `undefined` when
 * the portal may write it.
 *
 * Tool-owned means rendered by Helm, applied by a Flux Kustomization, or
 * labeled `app.kubernetes.io/managed-by` by anything other than the portal
 * itself (agentlab, for one, prunes and re-asserts its models on every run).
 * A CR with no markers at all — hand-applied with kubectl — is *not*
 * tool-owned: adopting those into portal management is the point.
 */
export function modelConfigOwner(modelConfig: ModelConfig): string | undefined {
  const provenance = readProvenance(modelConfig);

  if (provenance.helmRelease || provenance.fluxHelmRelease) {
    return 'Helm';
  }
  if (provenance.fluxKustomization) {
    return 'Flux';
  }
  if (
    provenance.managedBy &&
    provenance.managedBy !== BACKSTAGE_FIELD_MANAGER
  ) {
    return provenance.managedBy;
  }

  return undefined;
}
