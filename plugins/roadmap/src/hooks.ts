import { useApi } from '@backstage/frontend-plugin-api';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  roadmapApiRef,
  RoadmapItemFilters,
  RoadmapItemsResponse,
} from './apis';
import { STATUS_FIELD } from './lib/board';

export function useSchema() {
  const roadmapApi = useApi(roadmapApiRef);
  return useQuery({
    queryKey: ['roadmap', 'schema'],
    queryFn: () => roadmapApi.getSchema(),
    staleTime: 10 * 60_000,
  });
}

export function useItems(filters: RoadmapItemFilters, enabled = true) {
  const roadmapApi = useApi(roadmapApiRef);
  return useQuery({
    queryKey: ['roadmap', 'items', filters],
    queryFn: () => roadmapApi.listItems(filters),
    enabled,
  });
}

/**
 * Board field mutation with an optimistic status move: dropping a card in
 * another column (or picking a status from the card menu) re-buckets it
 * immediately in every cached list, then the refetch settles the truth.
 */
export function useUpdateItemField() {
  const roadmapApi = useApi(roadmapApiRef);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { itemId: string; name: string; value: string }) =>
      roadmapApi.updateItemField(
        variables.itemId,
        variables.name,
        variables.value,
      ),
    onMutate: async variables => {
      await queryClient.cancelQueries({ queryKey: ['roadmap', 'items'] });
      queryClient.setQueriesData<RoadmapItemsResponse>(
        { queryKey: ['roadmap', 'items'] },
        current =>
          current && {
            items: current.items.map(item =>
              item.id === variables.itemId
                ? {
                    ...item,
                    fields: {
                      ...item.fields,
                      [variables.name]: variables.value,
                    },
                  }
                : item,
            ),
          },
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['roadmap'] }),
  });
}

/** Convenience wrapper for the most common mutation: moving Status. */
export function useUpdateStatus() {
  const updateField = useUpdateItemField();
  return {
    ...updateField,
    moveTo: (itemId: string, status: string) =>
      updateField.mutate({ itemId, name: STATUS_FIELD, value: status }),
  };
}
