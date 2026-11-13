import {
  BACKSTAGE_FIELD_MANAGER,
  ModelConfig,
  readProvenance,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { type OrganizationDirectory } from './organizations';

/**
 * Where portal-created ModelConfigs (and their key Secrets) go: the namespace
 * the kagent chart installs its runtime and default ModelConfig into. Agents
 * are composed by agent-manager and deployed into their ModelConfig's
 * namespace, so this is also where portal-created agents land.
 */
export const MODEL_CONFIG_NAMESPACE = 'kagent';

/**
 * Whether a ModelConfig in `namespace` goes through the platform's LLM
 * listener: an organization's namespace (as agent-manager names it in
 * `directory`), where admission fills in the listener as the base URL and
 * refuses any other, and refuses a provider the listener does not serve.
 */
export function isListenerRouted(
  namespace: string,
  directory: OrganizationDirectory,
): boolean {
  return directory.has(namespace);
}

/** Providers the create/edit form speaks. A subset of the CRD's enum: the
 * others (AzureOpenAI, Bedrock, SAPAICore, Foundry, Mistral) carry provider
 * blocks this form has no fields for, so CRs using them render read-only and
 * stay kubectl territory. */
export type ModelProvider =
  | 'OpenAI'
  | 'Anthropic'
  | 'Gemini'
  | 'AnthropicVertexAI'
  | 'GeminiVertexAI'
  | 'Ollama';

export type VertexAIProvider = Extract<
  ModelProvider,
  'AnthropicVertexAI' | 'GeminiVertexAI'
>;

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
    id: 'AnthropicVertexAI',
    label: 'Claude on Vertex AI',
    description:
      'Claude models in your Google Cloud project, with a service account key.',
  },
  {
    id: 'GeminiVertexAI',
    label: 'Gemini on Vertex AI',
    description:
      'Gemini models in your Google Cloud project, with a service account key.',
  },
  {
    id: 'Ollama',
    label: 'Ollama',
    description: 'Models served by an Ollama host. No API key involved.',
  },
];

/**
 * The providers the form offers for an Organization's model: the ones the
 * LLM listener can serve and the form speaks. Which of them an installation's
 * listener serves is its `llmRouting.models`; admission names them when it
 * refuses another.
 */
export const LISTENER_PROVIDERS: readonly ModelProvider[] = [
  'Anthropic',
  'OpenAI',
  'AnthropicVertexAI',
  'GeminiVertexAI',
];

/** The providers the form offers for a model in `namespace`. */
export function providersFor(
  namespace: string,
  directory: OrganizationDirectory,
): readonly ModelProvider[] {
  return isListenerRouted(namespace, directory)
    ? LISTENER_PROVIDERS
    : MODEL_PROVIDER_OPTIONS.map(option => option.id);
}

export function isSupportedProvider(
  provider: string | undefined,
): provider is ModelProvider {
  return MODEL_PROVIDER_OPTIONS.some(option => option.id === provider);
}

export function isVertexAIProvider(
  provider: string | undefined,
): provider is VertexAIProvider {
  return provider === 'AnthropicVertexAI' || provider === 'GeminiVertexAI';
}

/** The annotation `ModelConfig.getDisplayName()` prefers. */
const DISPLAY_NAME_ANNOTATION = 'ui.giantswarm.io/display-name';

/** Nonsecret configuration collected before a credential operation. */
export type ModelConfigFormValues = {
  noCredential: boolean;
  /** ModelConfig CR name; immutable after creation. */
  name: string;
  /** Optional friendly name (the display-name annotation). */
  displayName: string;
  provider: ModelProvider;
  /** Provider model id, e.g. `claude-sonnet-4-6` or `qwen3-8-27b`. */
  model: string;
  /**
   * Base URL (OpenAI/Anthropic; empty = the provider's default endpoint) or
   * Ollama host. Unused for Gemini and Vertex AI.
   */
  endpoint: string;
  /**
   * Vertex AI only: the Google Cloud project the model runs in. Not typed:
   * kagent accepts only a key of the model's own project, so it is the key's
   * `project_id` ({@link serviceAccountKeyProject}), or the stored model's.
   */
  projectID: string;
  /** Vertex AI only: `global`, the `us`/`eu` multi-region, or a region. */
  location: string;
  /** `spec.tls.disableVerify`, for self-signed lab endpoints. */
  insecureSkipTlsVerify: boolean;
};

export const INITIAL_MODEL_CONFIG_FORM: ModelConfigFormValues = {
  noCredential: false,
  name: '',
  displayName: '',
  provider: 'OpenAI',
  model: '',
  endpoint: '',
  projectID: '',
  location: '',
  insecureSkipTlsVerify: false,
};

/** Whether the endpoint field applies to this provider at all. */
export function providerHasEndpoint(provider: ModelProvider): boolean {
  return provider !== 'Gemini' && !isVertexAIProvider(provider);
}

// RFC1123 DNS label: the name becomes the ModelConfig CR name (and the key
// Secret's name suffix), so it must be a valid k8s object name.
const DNS_LABEL_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

/** The model form's fields a validation problem can belong to. */
export type ModelConfigField =
  'displayName' | 'name' | 'model' | 'endpoint' | 'location' | 'projectID';

export type ModelConfigFieldErrors = Partial<Record<ModelConfigField, string>>;

/** The fields in form order: the order {@link validateModelConfigForm} lists. */
const MODEL_CONFIG_FIELDS: readonly ModelConfigField[] = [
  'displayName',
  'name',
  'model',
  'endpoint',
  'location',
  'projectID',
];

/**
 * The locations kagent knows how to reach (its `VertexAIHostname`): the
 * global endpoint, the `us` and `eu` multi-regions, or a region such as
 * `europe-west4`.
 */
const VERTEX_AI_LOCATION_PATTERN = /^(global|us|eu|[a-z]+-[a-z]+[0-9]+)$/;

/**
 * Why kagent would refuse this service account key, or `undefined` when it
 * would accept it: the checks of kagent's `ValidateGoogleServiceAccountKey`,
 * run here so the problem shows on the field instead of on the agent later.
 */
export function serviceAccountKeyError(
  raw: string,
  projectID: string,
): string | undefined {
  let key: unknown;
  try {
    key = JSON.parse(raw);
  } catch {
    return 'This file is not a JSON key. Choose the JSON key file of a service account, as Google Cloud downloads it.';
  }
  if (typeof key !== 'object' || key === null || Array.isArray(key)) {
    return 'This file is not a JSON key. Choose the JSON key file of a service account, as Google Cloud downloads it.';
  }
  const {
    type,
    project_id: keyProject,
    token_uri: tokenURI,
  } = key as Record<string, unknown>;
  if (type !== 'service_account') {
    return 'This file is not a service account key. Create a JSON key for a service account in Google Cloud, then choose that file.';
  }
  if (typeof keyProject !== 'string' || !keyProject) {
    return 'This key names no project. Create a new JSON key in Google Cloud, then choose that file.';
  }
  const project = projectID.trim();
  if (project && keyProject !== project) {
    return `This key belongs to project ${keyProject}, not ${project}. Choose a key of ${project}.`;
  }
  if (tokenURI !== undefined && tokenURI !== '') {
    let host: string | undefined;
    let protocol: string | undefined;
    try {
      const url = new URL(String(tokenURI));
      host = url.hostname;
      protocol = url.protocol;
    } catch {
      host = undefined;
    }
    if (protocol !== 'https:' || host !== 'oauth2.googleapis.com') {
      return 'This key gets its tokens from somewhere other than https://oauth2.googleapis.com, so agents cannot use it. Choose a key Google Cloud created.';
    }
  }
  return undefined;
}

/** What a service account key file says about itself, none of it secret. */
export type ServiceAccountKeySummary = {
  projectID?: string;
  clientEmail?: string;
};

/**
 * The project and account a service account key file names, for the form to
 * show what it read and to take the project from. `undefined` when the text
 * is not a JSON object.
 */
export function serviceAccountKeySummary(
  raw: string,
): ServiceAccountKeySummary | undefined {
  let key: unknown;
  try {
    key = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof key !== 'object' || key === null || Array.isArray(key)) {
    return undefined;
  }
  const { project_id: projectID, client_email: clientEmail } = key as Record<
    string,
    unknown
  >;
  return {
    projectID:
      typeof projectID === 'string' && projectID ? projectID : undefined,
    clientEmail:
      typeof clientEmail === 'string' && clientEmail ? clientEmail : undefined,
  };
}

export type ModelConfigValidationOptions = {
  isEdit: boolean;
  /** Edit only: the form as the model stood on the cluster. */
  original?: ModelConfigFormValues;
  /**
   * An organization's model (`isListenerRouted`): saved through
   * agent-manager, which keeps no display name, so the form asks for the
   * model's name itself.
   */
  routed?: boolean;
};

export function modelNameError(
  name: string,
  routed = false,
): string | undefined {
  if (!name.trim()) {
    return routed ? 'Enter a name for the model.' : 'Enter a technical name.';
  }
  if (name.length > 63 || !DNS_LABEL_PATTERN.test(name)) {
    return `${routed ? 'The name' : 'Technical name'} must be lowercase letters, numbers and hyphens (max 63 characters), e.g. qwen3-vllm`;
  }
  return undefined;
}

/**
 * Validation problems by the field each belongs to; empty when the form can
 * be saved. The form shows each on its own field.
 *
 * The display name is required on create only: the technical name is filled
 * in from it, and it is what people see when they choose a model. An existing
 * model without one (made with kubectl) stays saveable as it is. An
 * organization's model asks for no display name (`routed`). The API key
 * is not required for the API-key providers, where an empty one means the
 * endpoint needs none. A Vertex AI model needs a service account key on
 * create, and on an edit whose stored key cannot serve it (see
 * {@link keyRequired}); a key entered is checked as kagent checks it.
 */
export function modelConfigFieldErrors(
  values: ModelConfigFormValues,
  options: ModelConfigValidationOptions = { isEdit: false },
): ModelConfigFieldErrors {
  const errors: ModelConfigFieldErrors = {};

  if (!options.isEdit && !options.routed && !values.displayName.trim()) {
    errors.displayName = 'Enter a name for the model.';
  }

  const nameError = modelNameError(values.name, options.routed);
  if (nameError) errors.name = nameError;

  if (!values.model.trim()) {
    errors.model = 'Enter the model id.';
  }

  if (values.provider === 'Ollama' && !values.endpoint.trim()) {
    errors.endpoint = 'Enter the Ollama host, e.g. http://ollama.ollama:11434.';
  } else if (
    values.endpoint.trim() &&
    !/^https?:\/\//.test(values.endpoint.trim())
  ) {
    errors.endpoint = 'The endpoint must be an http:// or https:// URL';
  }

  if (isVertexAIProvider(values.provider)) {
    const location = values.location.trim();
    if (!location) {
      errors.location = 'Enter the location, e.g. global or europe-west4.';
    } else if (!VERTEX_AI_LOCATION_PATTERN.test(location)) {
      errors.location =
        'Enter global, us, eu or a region such as europe-west4.';
    }

    if (!values.projectID.trim()) {
      errors.projectID = 'Enter the Google Cloud project.';
    }
  }

  return errors;
}

/**
 * Validation problems, in form order; empty when the form can be saved. The
 * list form of {@link modelConfigFieldErrors}, for a summary of them all.
 */
export function validateModelConfigForm(
  values: ModelConfigFormValues,
  options: ModelConfigValidationOptions = { isEdit: false },
): string[] {
  const errors = modelConfigFieldErrors(values, options);
  return MODEL_CONFIG_FIELDS.map(field => errors[field]).filter(
    (error): error is string => Boolean(error),
  );
}

/**
 * Whether the edit form holds anything to save: a field differs from what it
 * started from, or a key was entered (the key field always starts empty).
 */
export function modelConfigFormChanged(
  values: ModelConfigFormValues,
  initial: ModelConfigFormValues,
): boolean {
  return (
    values.displayName.trim() !== initial.displayName.trim() ||
    values.provider !== initial.provider ||
    values.model.trim() !== initial.model.trim() ||
    values.endpoint.trim() !== initial.endpoint.trim() ||
    values.projectID.trim() !== initial.projectID.trim() ||
    values.location.trim() !== initial.location.trim() ||
    values.noCredential !== initial.noCredential ||
    values.insecureSkipTlsVerify !== initial.insecureSkipTlsVerify
  );
}

/**
 * Prefill for the edit form. `undefined` when the CR's provider is not one
 * this form speaks — the model then offers no edit.
 */
export function modelConfigFormValues(
  modelConfig: ModelConfig,
): ModelConfigFormValues | undefined {
  const provider = modelConfig.getProvider();
  if (!isSupportedProvider(provider)) {
    return undefined;
  }

  let endpoint: string | undefined;
  let vertex: { projectID?: string; location?: string } | undefined;
  if (provider === 'AnthropicVertexAI') {
    vertex = modelConfig.getAnthropicVertexAI();
  } else if (provider === 'GeminiVertexAI') {
    vertex = modelConfig.getGeminiVertexAI();
  } else if (provider === 'Ollama') {
    endpoint = modelConfig.getOllama()?.host;
  } else if (provider === 'Anthropic') {
    endpoint = modelConfig.getAnthropic()?.baseUrl;
  } else if (provider === 'OpenAI') {
    endpoint = modelConfig.getOpenAI()?.baseUrl;
  }

  const displayName =
    modelConfig.getAnnotations()?.[DISPLAY_NAME_ANNOTATION] ?? '';

  return {
    noCredential: !modelConfig.getApiKeySecret(),
    name: modelConfig.getName(),
    displayName,
    provider,
    model: modelConfig.getModel() ?? '',
    endpoint: endpoint ?? '',
    projectID: vertex?.projectID ?? '',
    location: vertex?.location ?? '',
    insecureSkipTlsVerify: modelConfig.getTls()?.disableVerify === true,
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

/** The `app.kubernetes.io/managed-by` value of what agent-manager writes. */
export const AGENT_MANAGER_MANAGED_BY = 'agent-manager';

/**
 * Who would revert an edit made with the portal's form ({@link
 * modelConfigOwner}), except that an organization's model agent-manager
 * wrote is no owner to step back for: the form saves an organization's model
 * through agent-manager itself.
 */
export function modelConfigEditOwner(
  modelConfig: ModelConfig,
  directory: OrganizationDirectory,
): string | undefined {
  const owner = modelConfigOwner(modelConfig);
  if (
    owner === AGENT_MANAGER_MANAGED_BY &&
    (modelConfig.getNamespace() === MODEL_CONFIG_NAMESPACE ||
      isListenerRouted(modelConfig.getNamespace() ?? '', directory))
  ) {
    return undefined;
  }
  return owner;
}
