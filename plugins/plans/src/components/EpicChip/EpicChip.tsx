import { Chip, Tooltip } from '@material-ui/core';
import { Link } from '@backstage/core-components';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { EpicRef } from '../../apis';
import { roadmapItemExternalRouteRef } from '../../routes';

/** The slice of a roadmap board item the chip needs. */
interface BoardItem {
  id: string;
  title: string;
  fields: Record<string, string>;
}

/**
 * Chip linking a plan to the roadmap epic it implements. When the roadmap
 * plugin can resolve the epic's board item, the chip shows its Status and
 * links to the epic detail view; otherwise it links to the GitHub issue.
 */
export function EpicChip({ epic }: { epic: EpicRef }) {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const itemLink = useRouteRef(roadmapItemExternalRouteRef);

  // The roadmap plugin's backend is queried directly (instead of through its
  // frontend API) to avoid coupling the plugin packages; portals without the
  // roadmap plugin get the GitHub fallback via the failed query.
  const { data: item } = useQuery({
    queryKey: ['plans', 'epic-item', epic.owner, epic.repo, epic.number],
    queryFn: async (): Promise<BoardItem> => {
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

  const status = item?.fields?.Status;
  const to = item && itemLink ? itemLink({ id: item.id }) : epic.url;

  return (
    <Tooltip title={item?.title ?? `${epic.owner}/${epic.repo}#${epic.number}`}>
      <Link to={to} underline="none">
        <Chip
          size="small"
          variant="outlined"
          clickable
          label={status ? `Epic · ${status}` : `Epic #${epic.number}`}
        />
      </Link>
    </Tooltip>
  );
}
