import type { Entity } from '@backstage/catalog-model';
import type { DeferredEntity } from '@backstage/plugin-catalog-node';
import type { KlausInstanceConfig } from './config';
import type { DiscoveredPlugin } from './discoverPlugins';
import { PROVIDER_NAME } from './buildPersonalityEntity';

export function buildPluginEntity(options: {
  plugin: DiscoveredPlugin;
  instance: KlausInstanceConfig;
}): DeferredEntity {
  const { plugin, instance } = options;
  const { name, source, branch, pluginDir, description } = plugin;
  const { owner, repo, ociRepository } = source;
  const { namePostfix, titlePostfix } = instance;

  const repoUrl = `https://github.com/${owner}/${repo}`;
  const dirUrl = `${repoUrl}/tree/${branch}/${pluginDir}`;
  const imageRef = `${ociRepository}/${name}`;

  const annotations: Record<string, string> = {
    'backstage.io/source-location': `url:${dirUrl}`,
    'backstage.io/managed-by-location': `url:${repoUrl}`,
    'backstage.io/managed-by-origin-location': `url:${repoUrl}`,
    'github.com/project-slug': `${owner}/${repo}`,
    'giantswarm.io/release-tag-prefix': `${name}/`,
    'giantswarm.io/oci-repository': imageRef,
  };

  const tags = Array.from(new Set(['klaus-plugin', ...instance.tags]));

  const namespace = instance.namespace ?? 'default';

  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: `klaus-plugin-${name}${namePostfix}`,
      ...(instance.namespace ? { namespace: instance.namespace } : {}),
      title: `${name} plugin${titlePostfix}`,
      description:
        description ?? `Klaus plugin "${name}" from ${owner}/${repo}.`,
      tags,
      annotations,
    },
    spec: {
      type: 'klaus-plugin',
      lifecycle: 'production',
      owner: instance.owner,
      ...(instance.system ? { system: instance.system } : {}),
      subcomponentOf: `component:${namespace}/${repo}`,
    },
  };

  return {
    entity,
    locationKey: `${PROVIDER_NAME}:${instance.id}:${owner}/${repo}/${pluginDir}`,
  };
}
