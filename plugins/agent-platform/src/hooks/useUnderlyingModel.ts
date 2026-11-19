import {
  ModelConfig,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/** The part of a ModelConfig that says what it runs. */
type ModelSpec = {
  getModel(): string | undefined;
  getProvider(): string | undefined;
};

/**
 * The model and provider as one line, omitting a model already shown in the
 * label. Provider information remains available when the label is the model.
 */
export function underlyingModelLine(
  modelConfig: ModelSpec | undefined,
  label?: string,
): string | undefined {
  const model = modelConfig?.getModel();
  const line = [model !== label ? model : undefined, modelConfig?.getProvider()]
    .filter(Boolean)
    .join(' · ');
  return line || undefined;
}

/**
 * The underlying model of one ModelConfig (see `underlyingModelLine`), by a
 * targeted, namespaced read rather than ModelConfigsProvider's cluster-wide
 * list: that list is admin-only, and the pages using this are not mounted
 * inside it. Undefined while the read is in flight, when it fails (normal for
 * a person who may not read ModelConfigs there) and when nothing is picked.
 */
export function useUnderlyingModel(
  installation: string | undefined,
  name: string | undefined,
  namespace: string | undefined,
): string | undefined {
  const { resource } = useResource(
    installation ?? '',
    ModelConfig,
    { name: name ?? '', namespace, enableDiscovery: false },
    { enabled: Boolean(installation && name && namespace) },
  );
  return underlyingModelLine(resource);
}
