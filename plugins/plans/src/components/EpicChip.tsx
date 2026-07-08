import { Chip, Tooltip, makeStyles, Theme } from '@material-ui/core';
import TimelineIcon from '@material-ui/icons/Timeline';
import { Link as RouterLink } from 'react-router-dom';
import { useApi } from '@backstage/frontend-plugin-api';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { EpicLink } from '../lib/epicLink';

const useStyles = makeStyles((theme: Theme) => ({
  chip: {
    marginBottom: theme.spacing(2),
  },
}));

/**
 * Chip linking a plan to its epic. Resolves the epic issue to its roadmap
 * board item via the roadmap backend and links to the in-portal item view;
 * when the roadmap plugin is not installed (or the issue is not on the
 * board) it degrades to a plain GitHub link.
 */
export function EpicChip({ epic }: { epic: EpicLink }) {
  const classes = useStyles();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const { data } = useQuery({
    queryKey: ['plans', 'epic-item', epic.url],
    retry: false,
    queryFn: async (): Promise<{ itemId: string } | null> => {
      const baseUrl = await discoveryApi.getBaseUrl('roadmap');
      const url = new URL(`${baseUrl}/resolve-item`);
      url.searchParams.set('issue', epic.url);
      const response = await fetchApi.fetch(url.toString());
      if (!response.ok) {
        return null;
      }
      return response.json();
    },
  });

  const label = `Epic: ${epic.label}`;
  if (data?.itemId) {
    return (
      <Tooltip title="Open on the roadmap board">
        <Chip
          className={classes.chip}
          color="primary"
          variant="outlined"
          icon={<TimelineIcon />}
          label={label}
          component={RouterLink}
          to={`/roadmap/item/${encodeURIComponent(data.itemId)}`}
          clickable
        />
      </Tooltip>
    );
  }
  return (
    <Tooltip title="Open on GitHub">
      <Chip
        className={classes.chip}
        variant="outlined"
        icon={<TimelineIcon />}
        label={label}
        component="a"
        href={epic.url}
        target="_blank"
        rel="noopener"
        clickable
      />
    </Tooltip>
  );
}
