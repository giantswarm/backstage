import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

export function useCatalogEntityByRef(
  entityRef?:
    | string
    | {
        kind: string;
        name: string;
        namespace: string;
      },
) {
  const catalogApi = useApi(catalogApiRef);

  const { data, isPending, fetchStatus } = useQuery({
    queryKey: ['catalog-entity', entityRef],
    queryFn: async () => {
      if (!entityRef) {
        return null;
      }

      return catalogApi.getEntityByRef(entityRef) ?? null;
    },
    enabled: Boolean(entityRef),
  });
  const isLoading = isAwaitingData({ isPending, fetchStatus });

  return useMemo(() => {
    return {
      entity: data,
      isLoading,
    };
  }, [data, isLoading]);
}
