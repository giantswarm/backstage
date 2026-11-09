/**
 * A namespace's default model: the one ModelConfig there annotated
 * `agent-platform.giantswarm.io/is-default-model-config: "true"`. As with the
 * default IngressClass, none annotated or more than one is no default. Nothing
 * enforces a single mark, so every write here refuses to create a second one.
 *
 * Where agents are created, agent-manager's `list_model_configs` answers which
 * model is the default (`default`); the portal reads that field there rather
 * than resolving it again. The annotation itself is what the portal shows on a
 * model's own page and what it writes.
 */

/** The marker annotation. */
export const DEFAULT_MODEL_ANNOTATION =
  'agent-platform.giantswarm.io/is-default-model-config';

/** The part of a ModelConfig the marker reads. */
export type MarkableModelConfig = {
  getName(): string;
  getNamespace(): string | undefined;
  getAnnotations(): Record<string, string> | undefined;
};

/** Whether a ModelConfig carries the marker. */
export function isMarkedDefault(modelConfig: MarkableModelConfig): boolean {
  return modelConfig.getAnnotations()?.[DEFAULT_MODEL_ANNOTATION] === 'true';
}

/** The names of the ModelConfigs of `namespace` that carry the marker. */
export function markedIn(
  modelConfigs: readonly MarkableModelConfig[],
  namespace: string,
): string[] {
  return modelConfigs
    .filter(mc => (mc.getNamespace() ?? '') === namespace)
    .filter(isMarkedDefault)
    .map(mc => mc.getName())
    .sort();
}

/**
 * The default of `namespace`: the name of its one marked model, or undefined
 * when none or several are marked.
 */
export function defaultIn(
  modelConfigs: readonly MarkableModelConfig[],
  namespace: string,
): string | undefined {
  const marked = markedIn(modelConfigs, namespace);
  return marked.length === 1 ? marked[0] : undefined;
}

/**
 * The ids (`<installation>/<namespace>/<name>`) of the defaults among
 * `modelConfigs`, every namespace of every installation resolved on its own.
 */
export function defaultModelIds(
  modelConfigs: readonly (MarkableModelConfig & { cluster: string })[],
): Set<string> {
  const byNamespace = new Map<string, MarkableModelConfig[]>();
  for (const mc of modelConfigs) {
    const key = `${mc.cluster}/${mc.getNamespace() ?? ''}`;
    byNamespace.set(key, [...(byNamespace.get(key) ?? []), mc]);
  }
  const ids = new Set<string>();
  for (const [key, models] of byNamespace) {
    const name = defaultIn(models, models[0].getNamespace() ?? '');
    if (name) {
      ids.add(`${key}/${name}`);
    }
  }
  return ids;
}

/** The merge patch that adds the marker, or removes it. */
export function defaultMarkPatch(marked: boolean): Record<string, unknown> {
  return {
    metadata: {
      annotations: { [DEFAULT_MODEL_ANNOTATION]: marked ? 'true' : null },
    },
  };
}

/** A sentence listing names: `a`, `a and b`, `a, b and c`. */
export function listed(names: readonly string[]): string {
  if (names.length <= 1) {
    return names.join('');
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Which marks moving the default to `target` takes off, from a fresh read of
 * the namespace. `expected` is the marks the person saw when they asked: the
 * move takes those off and nothing else. A mark that appeared since (someone
 * else made another model the default) refuses the move instead of leaving two
 * marks, and so does a marked model a tool owns (`ownerOf`), since the tool
 * would put its mark back.
 */
export function planDefaultMove<T extends MarkableModelConfig>({
  modelConfigs,
  target,
  expected,
  ownerOf,
}: {
  modelConfigs: readonly T[];
  target: string;
  expected: readonly string[];
  ownerOf: (modelConfig: T) => string | undefined;
}): T[] {
  const others = modelConfigs.filter(
    mc => mc.getName() !== target && isMarkedDefault(mc),
  );
  const unexpected = others
    .filter(mc => !expected.includes(mc.getName()))
    .map(mc => mc.getName());
  if (unexpected.length > 0) {
    throw new Error(
      `${listed(unexpected)} ${
        unexpected.length === 1
          ? 'became the default'
          : 'were marked as the default'
      } while this page was open, so nothing was changed. Reload the page and try again.`,
    );
  }
  for (const mc of others) {
    const owner = ownerOf(mc);
    if (owner) {
      throw new Error(
        owner === 'Helm'
          ? `${mc.getName()} is the default through Helm values, which would mark it again. Move the default in that release's values.`
          : `${mc.getName()} is the default and ${owner} manages it, which would mark it again. Move the default where ${owner} is configured.`,
      );
    }
  }
  return others;
}
