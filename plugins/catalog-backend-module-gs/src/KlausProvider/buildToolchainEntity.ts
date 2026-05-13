import type { Entity } from '@backstage/catalog-model';
import type { DeferredEntity } from '@backstage/plugin-catalog-node';
import type { KlausInstanceConfig } from './config';
import type { DiscoveredToolchain } from './discoverToolchains';
import { PROVIDER_NAME } from './buildPersonalityEntity';

export function buildToolchainEntity(options: {
  toolchain: DiscoveredToolchain;
  instance: KlausInstanceConfig;
}): DeferredEntity {
  const { toolchain, instance } = options;
  const { name, dirName, source, branch } = toolchain;
  const { owner, repo, ociRepository } = source;
  const { namePostfix, titlePostfix } = instance;

  const repoUrl = `https://github.com/${owner}/${repo}`;
  const dirUrl = `${repoUrl}/tree/${branch}/${dirName}`;
  const imageRef = `${ociRepository}/${name}`;

  const annotations: Record<string, string> = {
    'backstage.io/source-location': `url:${dirUrl}`,
    'backstage.io/managed-by-location': `url:${repoUrl}`,
    'backstage.io/managed-by-origin-location': `url:${repoUrl}`,
    'github.com/project-slug': `${owner}/${repo}`,
    'giantswarm.io/release-tag-prefix': `${name}/`,
    'giantswarm.io/oci-repository': imageRef,
  };

  const tags = Array.from(new Set(['klaus-toolchain', ...instance.tags]));

  const namespace = instance.namespace ?? 'default';

  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: `klaus-toolchain-${name}${namePostfix}`,
      ...(instance.namespace ? { namespace: instance.namespace } : {}),
      title: `${name} toolchain${titlePostfix}`,
      description: `Klaus toolchain "${name}" from ${owner}/${repo}.`,
      tags,
      annotations,
    },
    spec: {
      type: 'klaus-toolchain',
      lifecycle: 'production',
      owner: instance.owner,
      ...(instance.system ? { system: instance.system } : {}),
      subcomponentOf: `component:${namespace}/${repo}`,
    },
  };

  return {
    entity,
    locationKey: `${PROVIDER_NAME}:${instance.id}:${owner}/${repo}/${dirName}`,
  };
}
