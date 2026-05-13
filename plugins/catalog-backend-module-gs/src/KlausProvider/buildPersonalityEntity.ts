import type { Entity } from '@backstage/catalog-model';
import type { DeferredEntity } from '@backstage/plugin-catalog-node';
import type { KlausInstanceConfig } from './config';
import type { DiscoveredPersonality } from './discoverPersonalities';
import { resolveEntityRef } from './resolveEntityRef';

export const PROVIDER_NAME = 'klaus-provider';

export function buildPersonalityEntity(options: {
  personality: DiscoveredPersonality;
  instance: KlausInstanceConfig;
  instances: KlausInstanceConfig[];
}): DeferredEntity {
  const { personality, instance, instances } = options;
  const { name, source, branch } = personality;
  const { owner, repo, ociRepository } = source;
  const { namePostfix, titlePostfix } = instance;

  const repoUrl = `https://github.com/${owner}/${repo}`;
  const dirUrl = `${repoUrl}/tree/${branch}/personalities/${name}`;
  const soulUrl = `${repoUrl}/blob/${branch}/personalities/${name}/SOUL.md`;
  const personalityYamlUrl = `${repoUrl}/blob/${branch}/personalities/${name}/personality.yaml`;
  const imageRef = `${ociRepository}/${name}`;

  const annotations: Record<string, string> = {
    'backstage.io/source-location': `url:${dirUrl}`,
    'backstage.io/managed-by-location': `url:${repoUrl}`,
    'backstage.io/managed-by-origin-location': `url:${repoUrl}`,
    'github.com/project-slug': `${owner}/${repo}`,
    'giantswarm.io/release-tag-prefix': `${name}/`,
    'giantswarm.io/klaus-soul-url': soulUrl,
    'giantswarm.io/klaus-personality-yaml-url': personalityYamlUrl,
    'giantswarm.io/klaus-personality-image': imageRef,
  };
  if (personality.toolchain) {
    annotations['giantswarm.io/klaus-personality-toolchain'] =
      `${personality.toolchain.repository}:${personality.toolchain.tag}`;
  }
  if (personality.plugins.length > 0) {
    annotations['giantswarm.io/klaus-personality-plugins'] = personality.plugins
      .map(p => `${p.repository}:${p.tag}`)
      .join('\n');
  }

  const dependsOn: string[] = [];
  if (personality.toolchain) {
    const ref = resolveEntityRef({
      kind: 'toolchains',
      ociRef: personality.toolchain.repository,
      instances,
    });
    if (ref) {
      dependsOn.push(ref);
    }
  }
  for (const plugin of personality.plugins) {
    const ref = resolveEntityRef({
      kind: 'plugins',
      ociRef: plugin.repository,
      instances,
    });
    if (ref && !dependsOn.includes(ref)) {
      dependsOn.push(ref);
    }
  }

  const tags = Array.from(new Set(['klaus-personality', ...instance.tags]));

  const namespace = instance.namespace ?? 'default';

  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: `klaus-personality-${name}${namePostfix}`,
      ...(instance.namespace ? { namespace: instance.namespace } : {}),
      title: `${name} personality${titlePostfix}`,
      description: `Klaus personality "${name}" from ${owner}/${repo}.`,
      tags,
      annotations,
    },
    spec: {
      type: 'klaus-personality',
      lifecycle: 'production',
      owner: instance.owner,
      ...(instance.system ? { system: instance.system } : {}),
      subcomponentOf: `component:${namespace}/${repo}`,
      ...(dependsOn.length > 0 ? { dependsOn } : {}),
    },
  };

  return {
    entity,
    locationKey: `${PROVIDER_NAME}:${instance.id}:${owner}/${repo}/personalities/${name}`,
  };
}
