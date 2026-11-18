import type { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import {
  fetchResourceList,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/** The Secret and key a model reads its API key from. */
export type ModelKeyReference = { secret: string; key: string };

/**
 * The key reference of a ModelConfig (`spec.apiKeySecret` and
 * `spec.apiKeySecretKey`), or why there is none to replace.
 */
export function modelKeyReference(modelConfig: ModelConfig): ModelKeyReference {
  const secret = modelConfig.getApiKeySecret();
  const key = modelConfig.getApiKeySecretKey();
  if (!secret || !key) {
    throw new Error(
      `Model ${modelConfig.getName()} names no key Secret, so it has no key to replace.`,
    );
  }
  return { secret, key };
}

/**
 * Reads, as the person, which Secret and key a model of `namespace` reads
 * its key from: agent-manager's `list_model_configs` does not report it, and
 * `replace_organization_credential` takes the Secret and key. Only the
 * ModelConfig is read, never the Secret.
 */
export async function readModelKeyReference({
  kubernetesApi,
  installation,
  namespace,
  name,
}: {
  kubernetesApi: KubernetesApi;
  installation: string;
  namespace: string;
  name: string;
}): Promise<ModelKeyReference> {
  let items: ModelConfig['jsonData'][];
  try {
    items = await fetchResourceList<ModelConfig['jsonData']>({
      kubernetesApi,
      cluster: installation,
      gvk: ModelConfig.getGVK(),
      namespace,
    });
  } catch (error) {
    throw new Error(
      `Could not read model ${name} to find its key Secret, so nothing was asked for. Reason: ${
        (error as Error).message
      }`,
    );
  }
  const item = items.find(candidate => candidate.metadata?.name === name);
  if (!item) {
    throw new Error(
      `Model ${name} is not in the organization any more. Read the models again.`,
    );
  }
  return modelKeyReference(new ModelConfig(item, installation));
}
