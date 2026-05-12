import type { Entity } from '@backstage/catalog-model';
import type { DeferredEntity } from '@backstage/plugin-catalog-node';
import type { DiscoveredPersonality } from './discoverPersonalities';

export const PROVIDER_NAME = 'klaus-personalities-provider';

export function buildPersonalityEntity(
  personality: DiscoveredPersonality,
): DeferredEntity {
  const { name, source, branch } = personality;
  const { owner, repo, internal, ociRegistry } = source;
  const entityName = internal
    ? `klaus-personality-${name}-internal`
    : `klaus-personality-${name}`;
  const title = internal
    ? `${name} personality (internal)`
    : `${name} personality`;
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const dirUrl = `${repoUrl}/tree/${branch}/personalities/${name}`;
  const soulUrl = `${repoUrl}/blob/${branch}/personalities/${name}/SOUL.md`;
  const personalityYamlUrl = `${repoUrl}/blob/${branch}/personalities/${name}/personality.yaml`;
  const imageRef = `${ociRegistry}/${owner}/${repo}/${name}`;
  const subcomponentOf = internal
    ? 'klaus-personalities-internal'
    : 'klaus-personalities';

  const annotations: Record<string, string> = {
    'backstage.io/source-location': `url:${dirUrl}`,
    'backstage.io/managed-by-location': `url:${repoUrl}`,
    'backstage.io/managed-by-origin-location': `url:${repoUrl}`,
    'github.com/project-slug': `${owner}/${repo}`,
    'giantswarm.io/klaus-soul-url': soulUrl,
    'giantswarm.io/klaus-personality-yaml-url': personalityYamlUrl,
    'giantswarm.io/klaus-personality-image': imageRef,
  };
  if (personality.toolchain) {
    annotations['giantswarm.io/klaus-personality-toolchain'] =
      `${personality.toolchain.repository}:${personality.toolchain.tag}`;
  }

  const toolchainEntityRef = toolchainEntityRefFromRepository(
    personality.toolchain?.repository,
  );

  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: entityName,
      title,
      description: `Klaus personality "${name}"${internal ? ' (internal)' : ''} from ${owner}/${repo}.`,
      tags: ['klaus-personality', internal ? 'internal' : 'public'],
      annotations,
    },
    spec: {
      type: 'klaus-personality',
      lifecycle: 'production',
      owner: 'team-bumblebee',
      system: 'klaus',
      subcomponentOf,
      ...(toolchainEntityRef ? { dependsOn: [toolchainEntityRef] } : {}),
    },
  };

  return {
    entity,
    locationKey: `${PROVIDER_NAME}:${owner}/${repo}/personalities/${name}`,
  };
}

// Returns undefined for missing or malformed repository strings so the
// personality entity is still emitted without the cross-link.
function toolchainEntityRefFromRepository(
  repository: string | undefined,
): string | undefined {
  if (!repository) {
    return undefined;
  }
  const segments = repository.split('/');
  if (segments.length < 2) {
    return undefined;
  }
  const short = segments[segments.length - 1];
  if (!short) {
    return undefined;
  }
  const internal =
    repository.includes('/klaus-toolchains-internal/') ||
    segments[0] === 'gsociprivate.azurecr.io';
  return internal
    ? `component:default/klaus-toolchain-${short}-internal`
    : `component:default/klaus-toolchain-${short}`;
}
