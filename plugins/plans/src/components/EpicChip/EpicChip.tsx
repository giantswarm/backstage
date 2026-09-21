import { Tooltip } from '@material-ui/core';
import { Badge } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { stopRowPress } from '@giantswarm/backstage-plugin-ui-react';
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
 * Links a plan to the roadmap epic it implements. When the roadmap plugin can
 * resolve the epic's board item the link points at the epic detail view;
 * otherwise it falls back to the GitHub issue.
 *
 * `variant` picks how much the link has to say for itself. As a `badge` it
 * names itself ("Epic #123") because it sits among a list row's other
 * content; as a `link` it is just the issue number, because it sits in a
 * column already headed "Epic".
 */
export function EpicChip({
  epic,
  variant = 'badge',
}: {
  epic: EpicRef;
  variant?: 'badge' | 'link';
}) {
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
  // The status only ever reached the badge's label, so as a plain link it
  // would be lost; the tooltip carries it instead.
  const tooltip = [
    item?.title ?? `${epic.owner}/${epic.repo}#${epic.number}`,
    status,
  ]
    .filter(Boolean)
    .join(' \u00b7 ');

  return (
    <Tooltip title={tooltip}>
      {/* The chip sits inside a table row and a list row, both of which act on
          a press anywhere within them. Without this, clicking the chip would
          open the epic *and* open (or re-select) the plan behind it. */}
      <Link
        to={to}
        underline={variant === 'link' ? 'hover' : 'none'}
        onPointerDown={stopRowPress}
        onPointerUp={stopRowPress}
        onClick={stopRowPress}
      >
        {variant === 'link' ? (
          `#${epic.number}`
        ) : (
          <Badge size="small">
            {status ? `Epic · ${status}` : `Epic #${epic.number}`}
          </Badge>
        )}
      </Link>
    </Tooltip>
  );
}
