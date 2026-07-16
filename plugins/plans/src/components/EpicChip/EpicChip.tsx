import { Box, Chip, Tooltip, makeStyles, Theme } from '@material-ui/core';
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
  assignees: string[];
  fields: Record<string, string>;
}

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: theme.spacing(0.5),
  },
  assignees: {
    display: 'flex',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    maxWidth: 160,
  },
  assigneeChip: {
    height: 18,
    fontSize: 11,
  },
}));

/**
 * Chip linking a plan to the roadmap epic it implements. When the roadmap
 * plugin can resolve the epic's board item, the chip shows its Status and
 * links to the epic detail view; otherwise it links to the GitHub issue.
 * The epic's assignees, when known, are shown as `@login` chips below it.
 */
export function EpicChip({ epic }: { epic: EpicRef }) {
  const classes = useStyles();
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
  const assignees = item?.assignees ?? [];

  return (
    <Box className={classes.root}>
      <Tooltip
        title={item?.title ?? `${epic.owner}/${epic.repo}#${epic.number}`}
      >
        <Link to={to} underline="none">
          <Chip
            size="small"
            variant="outlined"
            clickable
            label={status ? `Epic · ${status}` : `Epic #${epic.number}`}
          />
        </Link>
      </Tooltip>
      {assignees.length > 0 && (
        <Box className={classes.assignees}>
          {assignees.map(login => (
            <Chip
              key={login}
              className={classes.assigneeChip}
              size="small"
              variant="outlined"
              label={`@${login}`}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
