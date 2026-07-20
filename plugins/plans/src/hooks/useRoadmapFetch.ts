import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/frontend-plugin-api';
import { useQuery, UseQueryResult } from '@tanstack/react-query';

/**
 * Query the roadmap plugin's backend directly (instead of through its frontend
 * API, which would couple the plugin packages). The path segments are
 * URL-encoded and appended to the roadmap base URL; a non-ok response throws so
 * the query fails and callers degrade gracefully -- portals without the roadmap
 * plugin, or epics with no matching board item / sub-issues, render nothing.
 * `retry: false` keeps that failure cheap and `staleTime` dedupes the shared
 * board-item lookup between EpicChip and EpicAssignees.
 *
 * This is the single place the "query roadmap directly, fall back on failure"
 * contract lives (auth via the fetch API, error handling, retry, staleTime);
 * both `useEpicBoardItem` and `EpicSubIssues` build on it. `select` lets a
 * caller unwrap the response body (e.g. `.item`) while keeping that contract
 * here.
 */
export function useRoadmapFetch<TBody, TData = TBody>(options: {
  path: Array<string | number>;
  queryKey: unknown[];
  select?: (body: TBody) => TData;
}): UseQueryResult<TData> {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  return useQuery({
    queryKey: options.queryKey,
    queryFn: async (): Promise<TBody> => {
      const baseUrl = await discoveryApi.getBaseUrl('roadmap');
      const path = options.path
        .map(segment => encodeURIComponent(String(segment)))
        .join('/');
      const response = await fetchApi.fetch(`${baseUrl}/${path}`);
      if (!response.ok) {
        throw new Error(
          `Roadmap request failed with status ${response.status}`,
        );
      }
      return response.json();
    },
    select: options.select,
    retry: false,
    staleTime: 60_000,
  });
}
