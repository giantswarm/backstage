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
