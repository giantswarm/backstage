import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { getDeploymentNamesFromEntity } from '../utils/entity';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useQuery } from '@tanstack/react-query';

export function useCatalogEntitiesForDeployments() {
  const catalogApi = useApi(catalogApiRef);

  const { data: catalogEntities, isLoading } = useQuery({
    queryKey: ['catalog-entities', 'kind', 'component'],
    queryFn: () =>
      catalogApi.getEntities({
        filter: { kind: 'component' },
      }),
    select: data => data.items,
  });

  return useMemo(() => {
    if (!catalogEntities) {
      return {
        catalogEntities: [],
        catalogEntitiesMap: {} as Record<string, string>,
      };
    }

    const catalogEntitiesMap = catalogEntities.reduce(
      (acc: Record<string, string>, entity) => {
        const entityDeploymentNames = getDeploymentNamesFromEntity(entity);
        if (!entityDeploymentNames) {
          return acc;
        }

        entityDeploymentNames.forEach(deploymentName => {
          acc[deploymentName] = stringifyEntityRef(entity);
        });

        return acc;
      },
      {},
    );

    return {
      catalogEntities,
      catalogEntitiesMap,
      isLoading,
    };
  }, [catalogEntities, isLoading]);
}
