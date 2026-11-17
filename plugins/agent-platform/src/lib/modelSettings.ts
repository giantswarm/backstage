import type { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import { formatCount } from '@giantswarm/backstage-plugin-agent-platform-common';

import {
  AgentManagerError,
  type AgentManagerModelConfig,
} from './agentManager';

/** How long a cached prompt stays: the values kagent's `cacheTTL` takes. */
export type CacheTTL = '5m' | '1h';

/** The cache time agent-manager gives a model whose caching is turned on. */
export const DEFAULT_CACHE_TTL: CacheTTL = '5m';

export const CACHE_TTL_OPTIONS: { id: CacheTTL; label: string }[] = [
  { id: '5m', label: '5 minutes' },
  { id: '1h', label: '1 hour' },
];

function isCacheTTL(value: unknown): value is CacheTTL {
  return value === '5m' || value === '1h';
}

/**
 * Which settings a provider's block of a ModelConfig has, and its key in the
 * spec: agent-manager's `modelSettingsBlocks`
 * (internal/agents/model_settings.go). The API server refuses a setting a
 * block does not have, so the form offers only these.
 */
type SettingsBlock = { key: string; caching: boolean; maxTokens: boolean };

const SETTINGS_BLOCKS: Partial<Record<string, SettingsBlock>> = {
  anthropic: { key: 'anthropic', caching: true, maxTokens: true },
  bedrock: { key: 'bedrock', caching: true, maxTokens: false },
  anthropicvertexai: {
    key: 'anthropicVertexAI',
    caching: false,
    maxTokens: true,
  },
  azureopenai: { key: 'azureOpenAI', caching: false, maxTokens: true },
  mistral: { key: 'mistral', caching: false, maxTokens: true },
  openai: { key: 'openAI', caching: false, maxTokens: true },
};

/** The settings a provider's models have; none for an unknown provider. */
export function providerSettings(provider: string | undefined): {
  maxTokens: boolean;
  caching: boolean;
} {
  const block = SETTINGS_BLOCKS[(provider ?? '').toLowerCase()];
  return {
    maxTokens: block?.maxTokens ?? false,
    caching: block?.caching ?? false,
  };
}

/** Whether a provider's models have any of the settings. */
export function providerHasSettings(provider: string | undefined): boolean {
  const { maxTokens, caching } = providerSettings(provider);
  return maxTokens || caching;
}

/**
 * The `set_organization_model` arguments for the settings, which
 * agent-manager 3.1.0 and later take. An older one refuses an argument it
 * does not know, so the portal offers and sends them only where the tool's
 * schema lists every one.
 */
export const MODEL_SETTINGS_FIELDS = [
  'maxTokens',
  'promptCaching',
  'cacheTTL',
] as const;

/** Whether a `set_organization_model` input schema takes the settings. */
export function takesModelSettings(
  inputSchema: { properties?: Record<string, unknown> } | undefined,
): boolean {
  const properties = inputSchema?.properties ?? {};
  return MODEL_SETTINGS_FIELDS.every(field => Object.hasOwn(properties, field));
}

/** A model's settings as the form holds them. */
export type ModelSettingsValues = {
  /** The token limit of an answer; `undefined` is the provider's default. */
  maxTokens: number | undefined;
  promptCaching: boolean;
  cacheTTL: CacheTTL;
};

/** A new model's settings: an Anthropic model caches, as agent-manager's default. */
export const INITIAL_MODEL_SETTINGS: ModelSettingsValues = {
  maxTokens: undefined,
  promptCaching: true,
  cacheTTL: DEFAULT_CACHE_TTL,
};

/**
 * A ModelConfig's stored settings, for the edit form. Unset caching is off,
 * kagent's default; an unset cache time shows the one agent-manager would
 * write when caching is turned on.
 */
export function storedModelSettings(
  modelConfig: ModelConfig,
): ModelSettingsValues {
  const block =
    SETTINGS_BLOCKS[(modelConfig.getProvider() ?? '').toLowerCase()];
  const spec = modelConfig.jsonData.spec as Record<string, unknown> | undefined;
  const settings = (block ? spec?.[block.key] : undefined) as
    Record<string, unknown> | undefined;
  const maxTokens = settings?.maxTokens;
  return {
    maxTokens:
      block?.maxTokens &&
      typeof maxTokens === 'number' &&
      Number.isInteger(maxTokens) &&
      maxTokens > 0
        ? maxTokens
        : undefined,
    promptCaching: Boolean(block?.caching) && settings?.promptCaching === true,
    cacheTTL: isCacheTTL(settings?.cacheTTL)
      ? settings.cacheTTL
      : DEFAULT_CACHE_TTL,
  };
}

/** The `set_organization_model` arguments for the settings. */
export type ModelSettingsArguments = {
  maxTokens?: number;
  promptCaching?: boolean;
  cacheTTL?: CacheTTL;
};

/**
 * The settings arguments of a new model of `provider`: only those its block
 * has. An empty token limit is left to the provider; the cache time goes
 * only with caching on.
 */
export function newModelSettingsArguments(
  provider: string,
  values: ModelSettingsValues,
): ModelSettingsArguments {
  const { maxTokens, caching } = providerSettings(provider);
  return {
    ...(maxTokens && values.maxTokens !== undefined
      ? { maxTokens: values.maxTokens }
      : {}),
    ...(caching ? { promptCaching: values.promptCaching } : {}),
    ...(caching && values.promptCaching ? { cacheTTL: values.cacheTTL } : {}),
  };
}

/**
 * The settings arguments of an edit: only what the person changed, since an
 * omitted argument keeps the stored value. An emptied token limit is `0`,
 * which removes it (the provider's default).
 */
export function changedModelSettingsArguments(
  provider: string,
  values: ModelSettingsValues,
  initial: ModelSettingsValues,
): ModelSettingsArguments {
  const { maxTokens, caching } = providerSettings(provider);
  return {
    ...(maxTokens && values.maxTokens !== initial.maxTokens
      ? { maxTokens: values.maxTokens ?? 0 }
      : {}),
    ...(caching && values.promptCaching !== initial.promptCaching
      ? { promptCaching: values.promptCaching }
      : {}),
    ...(caching && values.promptCaching && values.cacheTTL !== initial.cacheTTL
      ? { cacheTTL: values.cacheTTL }
      : {}),
  };
}

/** Whether the person changed a setting the provider has. */
export function modelSettingsChanged(
  provider: string,
  values: ModelSettingsValues,
  initial: ModelSettingsValues,
): boolean {
  return (
    Object.keys(changedModelSettingsArguments(provider, values, initial))
      .length > 0
  );
}

/** The cache time as people read it. */
export function cacheTTLLabel(ttl: string | undefined): string {
  return CACHE_TTL_OPTIONS.find(option => option.id === ttl)?.label ?? '';
}

/**
 * A listed model's stored settings (`list_model_configs`), in two lines:
 * the token limit and the prompt caching. `undefined` for a provider without
 * either.
 */
export function modelSettingsSummary(
  model: Pick<
    AgentManagerModelConfig,
    'provider' | 'maxTokens' | 'promptCaching' | 'cacheTTL'
  >,
): { tokens?: string; caching?: string } | undefined {
  const { maxTokens, caching } = providerSettings(model.provider);
  if (!maxTokens && !caching) return undefined;
  let tokens: string | undefined;
  if (maxTokens) {
    tokens =
      model.maxTokens && model.maxTokens > 0
        ? `Token limit ${formatCount(model.maxTokens)}`
        : 'Provider’s token limit';
  }
  let cachingLine: string | undefined;
  if (caching) {
    const ttl = cacheTTLLabel(model.cacheTTL);
    if (model.promptCaching) {
      cachingLine = ttl ? `Prompt caching, ${ttl}` : 'Prompt caching';
    } else {
      cachingLine = 'No prompt caching';
    }
  }
  return { tokens, caching: cachingLine };
}

/** The settings' names as the form labels them. */
const SETTING_LABELS: Record<(typeof MODEL_SETTINGS_FIELDS)[number], string> = {
  maxTokens: 'token limit',
  promptCaching: 'prompt caching',
  cacheTTL: 'cache time',
};

/** What to do about a refused value of a setting. */
const SETTING_HINTS: Record<(typeof MODEL_SETTINGS_FIELDS)[number], string> = {
  maxTokens:
    'Enter a whole number of tokens above 0, or leave it empty for the provider’s default.',
  promptCaching:
    'Turn prompt caching off, or add a model of a provider that has it.',
  cacheTTL: 'Choose 5 minutes or 1 hour.',
};

const SETTING_PATH =
  /\b(?:spec\.[A-Za-z]+\.)?(maxTokens|promptCaching|cacheTTL)\b/;

/**
 * agent-manager's or the API server's refusal of a setting
 * (`invalid_request` that names the field, `spec.openAI.promptCaching`, say),
 * in the form's words: which setting, and what to do. `undefined` for any
 * other error.
 */
export function modelSettingRefusal(
  error: unknown,
  provider?: string,
): string | undefined {
  if (
    !(error instanceof AgentManagerError) ||
    error.code !== 'invalid_request'
  ) {
    return undefined;
  }
  const match = SETTING_PATH.exec(error.message);
  if (!match) return undefined;
  const field = match[1] as (typeof MODEL_SETTINGS_FIELDS)[number];
  const label = SETTING_LABELS[field];
  if (/unknown field|not declared/i.test(error.message)) {
    const whose = provider ? `${provider} models` : 'This provider’s models';
    return `${whose} have no ${label}, so the setting was refused and nothing was saved. Leave the ${label} out.`;
  }
  return `The ${label} was refused, and nothing was saved. ${SETTING_HINTS[field]}`;
}
