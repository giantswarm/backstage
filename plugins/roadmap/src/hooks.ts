import { useApi } from '@backstage/frontend-plugin-api';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import {
  roadmapApiRef,
  RoadmapItemFilters,
  RoadmapItemsResponse,
} from './apis';
import { mergeColumnReads, NO_STATUS, STATUS_FIELD } from './lib/board';

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
 * The board's items, one read per status column and one for the items
 * without a status, all at once. A team's board holds well over a thousand
 * items and GitHub serves a board 100 items per call, one call after the
 * other: one read of all of them takes about a minute, while a column of a
 * few hundred takes seconds. `pending` and `failed` name the columns whose
 * read has not landed; each column shows as soon as its own read does. A
 * board without a Status field is read in one.
 */
export function useBoardItems(filters: RoadmapItemFilters, columns: string[]) {
  const roadmapApi = useApi(roadmapApiRef);
  const reads: Array<{ column: string; filters: RoadmapItemFilters }> =
    columns.length > 0
      ? [
          ...columns.map(status => ({
            column: status,
            filters: { ...filters, status },
          })),
          { column: NO_STATUS, filters: { ...filters, empty: 'status' } },
        ]
      : [{ column: NO_STATUS, filters }];
  return useQueries({
    queries: reads.map(read => ({
      queryKey: ['roadmap', 'items', read.filters],
      queryFn: () => roadmapApi.listItems(read.filters),
    })),
    combine: results => {
      const columnsWhere = (test: (index: number) => boolean) =>
        new Set(reads.filter((_, index) => test(index)).map(r => r.column));
      return {
        items: mergeColumnReads(
          results.map((result, index) => ({
            column: reads[index].column,
            items: result.data?.items,
          })),
        ),
        // Pending, not loading: a retry waits while the tab is in the
        // background, and is pending without fetching.
        pending: columnsWhere(index => results[index].isPending),
        failed: columnsWhere(index => results[index].isError),
        isPending: results.some(result => result.isPending),
        allPending: results.every(result => result.isPending),
        error: results.find(result => result.error)?.error ?? null,
      };
    },
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
  return useTrackedMutation({
    event: null,
    untrackedReason: 'Internal roadmap tooling, not a customer portal action.',
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['roadmap'] }),
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
