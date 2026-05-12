import type { Entity } from '@backstage/catalog-model';
import type { DeferredEntity } from '@backstage/plugin-catalog-node';
import type { DiscoveredToolchain } from './discoverToolchains';

export const PROVIDER_NAME = 'klaus-toolchains-provider';

export function buildToolchainEntity(
  toolchain: DiscoveredToolchain,
): DeferredEntity {
  const { name, dirName, source, branch } = toolchain;
  const { owner, repo, internal, ociRegistry } = source;
  const entityName = internal
    ? `klaus-toolchain-${name}-internal`
    : `klaus-toolchain-${name}`;
  const title = internal ? `${name} toolchain (internal)` : `${name} toolchain`;
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const dirUrl = `${repoUrl}/tree/${branch}/${dirName}`;
  const dockerfileUrl = `${repoUrl}/blob/${branch}/${dirName}/Dockerfile`;
  const imageRef = `${ociRegistry}/${owner}/${repo}/${name}`;
  const subcomponentOf = internal
    ? 'klaus-toolchains-internal'
    : 'klaus-toolchains';

  const annotations: Record<string, string> = {
    'backstage.io/source-location': `url:${dirUrl}`,
    'backstage.io/managed-by-location': `url:${repoUrl}`,
    'backstage.io/managed-by-origin-location': `url:${repoUrl}`,
    'github.com/project-slug': `${owner}/${repo}`,
    'giantswarm.io/release-tag-prefix': `${name}/`,
    'giantswarm.io/klaus-toolchain-image': imageRef,
    'giantswarm.io/klaus-toolchain-dockerfile-url': dockerfileUrl,
  };

  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: entityName,
      title,
      description: `Klaus toolchain "${name}"${internal ? ' (internal)' : ''} from ${owner}/${repo}.`,
      tags: ['klaus-toolchain', internal ? 'internal' : 'public'],
      annotations,
    },
    spec: {
      type: 'klaus-toolchain',
      lifecycle: 'production',
      owner: 'team-bumblebee',
      system: 'klaus',
      subcomponentOf,
    },
  };

  return {
    entity,
    locationKey: `${PROVIDER_NAME}:${owner}/${repo}/${dirName}`,
  };
}
