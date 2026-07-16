import { Chip, Tooltip } from '@material-ui/core';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { EpicRef } from '../../apis';
import { roadmapItemExternalRouteRef } from '../../routes';
import { useEpicBoardItem } from './useEpicBoardItem';

/**
 * Chip linking a plan to the roadmap epic it implements. When the roadmap
 * plugin can resolve the epic's board item, the chip shows its Status and
 * links to the epic detail view; otherwise it links to the GitHub issue.
 */
export function EpicChip({ epic }: { epic: EpicRef }) {
  const itemLink = useRouteRef(roadmapItemExternalRouteRef);
  const { data: item } = useEpicBoardItem(epic);

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
