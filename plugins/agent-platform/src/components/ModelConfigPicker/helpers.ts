/**
 * The name of the ModelConfig the kagent chart creates from the platform's
 * provider values (`kagent.defaultModelConfigName` in its `_helpers.tpl`), and
 * the one kagent's Agent CRD falls back to when an agent names none: an
 * installation's default model.
 */
export const DEFAULT_MODEL_CONFIG_NAME = 'default-model-config';

/** The namespace the kagent chart puts its default ModelConfig in. */
export const DEFAULT_MODEL_CONFIG_NAMESPACE = 'kagent';

/** The part of a ModelConfig the preselection reads. */
type NamedModelConfig = {
  getName(): string;
  getNamespace(): string | undefined;
};

/**
 * Why a model was preselected: the installation's only one, its default
 * (`default-model-config`), or — with several and no default — the first
 * listed.
 */
export type PreselectionReason = 'only' | 'default' | 'first';

export function isDefaultModelConfig(modelConfig: NamedModelConfig): boolean {
  return modelConfig.getName() === DEFAULT_MODEL_CONFIG_NAME;
}

/**
 * The model the create form starts with on an installation: the sole one;
 * else the installation's default (`default-model-config`, the kagent
 * namespace's first when several namespaces hold one); else the first listed.
 * Undefined while there is none.
 */
export function preselectedModelConfig<T extends NamedModelConfig>(
  modelConfigs: readonly T[],
): { modelConfig: T; reason: PreselectionReason } | undefined {
  if (modelConfigs.length === 0) {
    return undefined;
  }
  if (modelConfigs.length === 1) {
    return { modelConfig: modelConfigs[0], reason: 'only' };
  }
  const defaults = modelConfigs.filter(isDefaultModelConfig);
  const platformDefault =
    defaults.find(mc => mc.getNamespace() === DEFAULT_MODEL_CONFIG_NAMESPACE) ??
    defaults[0];
  if (platformDefault) {
    return { modelConfig: platformDefault, reason: 'default' };
  }
  return { modelConfig: modelConfigs[0], reason: 'first' };
}

/** The part of a ModelConfig the picker shows and picks by. */
export type ModelChoice = NamedModelConfig & {
  getDisplayName(): string;
  getModel(): string | undefined;
  getProvider(): string | undefined;
};

/**
 * The models a new agent in `tenant` may run on: the ModelConfigs of that
 * namespace, every model when no tenant is known. No model is copied into a
 * tenant: an organization brings its own.
 */
export function tenantModelConfigs<T extends ModelChoice>(
  modelConfigs: readonly T[],
  tenant: string | undefined,
): ModelChoice[] {
  if (!tenant) {
    return [...modelConfigs];
  }
  return modelConfigs.filter(mc => (mc.getNamespace() ?? '') === tenant);
}

/**
 * agent-manager's reading of an organization's model as a choice of the
 * picker (`list_model_configs`), with the organization's default mark it
 * resolved.
 */
export type OrganizationModelChoice = ModelChoice & { isDefault: boolean };

export function organizationModelChoice(modelConfig: {
  name: string;
  namespace: string;
  provider?: string;
  model?: string;
  default?: boolean;
}): OrganizationModelChoice {
  return {
    getName: () => modelConfig.name,
    getNamespace: () => modelConfig.namespace,
    getDisplayName: () => modelConfig.name,
    getModel: () => modelConfig.model,
    getProvider: () => modelConfig.provider,
    isDefault: modelConfig.default === true,
  };
}
