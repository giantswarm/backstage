import type { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * What a reader calls the model: "ChatGPT (your subscription)" for a person's
 * own ChatGPT login, else the ModelConfig's display name, else the model it
 * configures, else its resource name.
 *
 * An admin's display name takes precedence because it may intentionally
 * abstract the underlying model.
 */
export function modelLabel(
  modelConfig: ModelConfig | undefined,
): string | undefined {
  if (!modelConfig) {
    return undefined;
  }
  if (modelConfig.isPersonalChatGptLogin()) {
    return modelConfig.getDisplayName();
  }
  return (
    modelConfig.getDisplayNameAnnotation() ??
    modelConfig.getModel() ??
    modelConfig.getName()
  );
}
