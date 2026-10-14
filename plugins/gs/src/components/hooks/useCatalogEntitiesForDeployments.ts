import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { getHelmChartsFromEntity } from '../utils/entity';
import { Entity } from '@backstage/catalog-model';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

export function useCatalogEntitiesForDeployments() {
  const catalogApi = useApi(catalogApiRef);

  const {
    data: catalogEntities,
    isPending,
    fetchStatus,
  } = useQuery({
    queryKey: ['catalog-entities', 'kind', 'component'],
    queryFn: () =>
      catalogApi.getEntities({
        filter: { kind: 'component' },
      }),
    select: data => data.items,
  });
  const isLoading = isAwaitingData({ isPending, fetchStatus });

  return useMemo(() => {
    if (!catalogEntities) {
      return {
        catalogEntities: [],
        catalogEntitiesMap: {} as Record<string, Entity>,
      };
    }

    const catalogEntitiesMap = catalogEntities.reduce(
      (acc: Record<string, Entity>, entity) => {
        const charts = getHelmChartsFromEntity(entity);
        if (charts.length === 0) {
          return acc;
        }

        charts.forEach(chart => {
          acc[chart.name] = entity;
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
