import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useQuery } from '@tanstack/react-query';

export function useCatalogEntityByLabel(filter: Record<string, string>) {
  const catalogApi = useApi(catalogApiRef);

  const { data, isLoading } = useQuery({
    queryKey: ['catalog-entity-by-label', filter],
    queryFn: async () => {
      const { items } = await catalogApi.getEntities({ filter });
      return items[0] ?? null;
    },
  });

  return useMemo(() => {
    return {
      entity: data ?? undefined,
      isLoading,
    };
  }, [data, isLoading]);
}
