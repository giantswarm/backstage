import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useQuery } from '@tanstack/react-query';

/**
 * Names of the installations that have a catalog entity
 * (`resource:default/<name>` of type `installation`). One request, shared by
 * every consumer through the query cache.
 */
export function useInstallationEntityNames({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const catalogApi = useApi(catalogApiRef);

  const { data, isLoading } = useQuery({
    queryKey: [
      'catalog-entities',
      'kind',
      'resource',
      'type',
      'installation',
      'namespace',
      'default',
      'names',
    ],
    queryFn: () =>
      catalogApi.getEntities({
        filter: {
          kind: 'resource',
          'metadata.namespace': 'default',
          'spec.type': 'installation',
        },
        fields: ['metadata.name'],
      }),
    select: response =>
      new Set(response.items.map(entity => entity.metadata.name)),
    enabled,
  });

  return { installationEntityNames: data, isLoading };
}
