import type { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * What a reader calls the model: "ChatGPT (your subscription)" for a person's
 * own ChatGPT login, else the ModelConfig's display name, else the model it
 * configures, else its resource name.
 *
 * An admin's display name wins, since an admin may name a model on purpose
 * ("The Cheap One") rather than after what it runs (PO decision L6). Without
 * one, the model says more than a resource name such as "anthropic".
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
