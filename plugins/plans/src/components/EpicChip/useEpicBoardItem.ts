import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { EpicRef } from '../../apis';

/** The slice of a roadmap board item the epic chip and assignees need. */
export interface EpicBoardItem {
  id: string;
  title: string;
  assignees: string[];
  fields: Record<string, string>;
}

/**
 * Fetch the roadmap board item for an epic. The roadmap plugin's backend is
 * queried directly (instead of through its frontend API) to avoid coupling
 * the plugin packages; portals without the roadmap plugin get a failed query
 * (callers fall back gracefully). The query key is shared so the chip and the
 * assignees line resolve from a single request.
 */
export function useEpicBoardItem(epic: EpicRef) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  return useQuery({
    queryKey: ['plans', 'epic-item', epic.owner, epic.repo, epic.number],
    queryFn: async (): Promise<EpicBoardItem> => {
      const baseUrl = await discoveryApi.getBaseUrl('roadmap');
      const response = await fetchApi.fetch(
        `${baseUrl}/items/by-issue/${encodeURIComponent(epic.owner)}/${encodeURIComponent(epic.repo)}/${epic.number}`,
      );
      if (!response.ok) {
        throw new Error(`Epic lookup failed with status ${response.status}`);
      }
      return (await response.json()).item;
    },
    retry: false,
    staleTime: 60_000,
  });
}
