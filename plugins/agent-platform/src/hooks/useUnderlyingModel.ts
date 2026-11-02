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
 * The model a ModelConfig runs, from its spec, as one line:
 * `claude-sonnet-4-6 · Anthropic`. Undefined when the spec names neither (or
 * the ModelConfig is not known).
 *
 * The ModelConfig's own name stays what people see — an admin may abstract the
 * model on purpose ("The Cheap One") — and this line is the progressive
 * disclosure beside it (PO decision L6).
 */
export function underlyingModelLine(
  modelConfig: ModelSpec | undefined,
): string | undefined {
  const line = [modelConfig?.getModel(), modelConfig?.getProvider()]
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
