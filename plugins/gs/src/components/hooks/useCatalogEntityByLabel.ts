import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

export function useCatalogEntityByLabel(filter: Record<string, string>) {
  const catalogApi = useApi(catalogApiRef);

  const { data, isPending, fetchStatus } = useQuery({
    queryKey: ['catalog-entity-by-label', filter],
    queryFn: async () => {
      const { items } = await catalogApi.getEntities({ filter });
      return items[0] ?? null;
    },
  });
  const isLoading = isAwaitingData({ isPending, fetchStatus });

  return useMemo(() => {
    return {
      entity: data ?? undefined,
      isLoading,
    };
  }, [data, isLoading]);
}
