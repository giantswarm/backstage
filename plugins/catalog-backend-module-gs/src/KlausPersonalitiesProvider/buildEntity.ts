import type { Entity } from '@backstage/catalog-model';
import type { DeferredEntity } from '@backstage/plugin-catalog-node';
import type { DiscoveredPersonality } from './discoverPersonalities';

export const PROVIDER_NAME = 'klaus-personalities-provider';

export function buildPersonalityEntity(
  personality: DiscoveredPersonality,
): DeferredEntity {
  const { name, source, branch } = personality;
  const { owner, repo, internal } = source;
  const entityName = internal
    ? `klaus-personality-${name}-internal`
    : `klaus-personality-${name}`;
  const title = internal ? `${name} (internal)` : name;
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const dirUrl = `${repoUrl}/tree/${branch}/personalities/${name}`;
  const soulUrl = `${repoUrl}/blob/${branch}/personalities/${name}/SOUL.md`;
  const personalityYamlUrl = `${repoUrl}/blob/${branch}/personalities/${name}/personality.yaml`;
  const dependsOnParent = internal
    ? 'component:default/klaus-personalities-internal'
    : 'component:default/klaus-personalities';

  const annotations: Record<string, string> = {
    'backstage.io/source-location': `url:${dirUrl}`,
    'backstage.io/managed-by-location': `url:${repoUrl}`,
    'backstage.io/managed-by-origin-location': `url:${repoUrl}`,
    'github.com/project-slug': `${owner}/${repo}`,
    'giantswarm.io/klaus-soul-url': soulUrl,
    'giantswarm.io/klaus-personality-yaml-url': personalityYamlUrl,
  };
  if (personality.toolchain) {
    annotations['giantswarm.io/klaus-personality-toolchain'] =
      `${personality.toolchain.repository}:${personality.toolchain.tag}`;
  }

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
      dependsOn: [dependsOnParent],
    },
  };

  return {
    entity,
    locationKey: `${PROVIDER_NAME}:${owner}/${repo}/personalities/${name}`,
  };
}
