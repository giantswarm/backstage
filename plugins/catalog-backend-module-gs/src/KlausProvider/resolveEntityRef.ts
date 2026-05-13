import type { KlausInstanceConfig, KlausSourceKind } from './config';

const KIND_TO_ENTITY_PREFIX: Record<KlausSourceKind, string> = {
  personalities: 'klaus-personality',
  toolchains: 'klaus-toolchain',
  plugins: 'klaus-plugin',
};

// Given an OCI ref like `gsociprivate.azurecr.io/giantswarm/klaus-plugins/gs-base:v0.0.7`,
// match it against the configured instances and return the corresponding catalog
// entity ref. Returns undefined when no instance has a matching ociRepository.
export function resolveEntityRef(options: {
  kind: KlausSourceKind;
  ociRef: string;
  instances: KlausInstanceConfig[];
}): string | undefined {
  const { kind, ociRef, instances } = options;
  const withoutTag = ociRef.split(':')[0];
  const lastSlash = withoutTag.lastIndexOf('/');
  if (lastSlash < 0) {
    return undefined;
  }
  const prefix = withoutTag.slice(0, lastSlash);
  const name = withoutTag.slice(lastSlash + 1);
  if (!name) {
    return undefined;
  }

  for (const instance of instances) {
    const source = instance[kind];
    if (source && source.ociRepository === prefix) {
      const namespace = instance.namespace ?? 'default';
      return `component:${namespace}/${KIND_TO_ENTITY_PREFIX[kind]}-${name}${instance.namePostfix}`;
    }
  }

  return undefined;
}
