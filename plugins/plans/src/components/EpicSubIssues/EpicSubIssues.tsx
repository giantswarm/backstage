import {
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import { Link } from '@backstage/core-components';
import {
  discoveryApiRef,
  fetchApiRef,
  useApi,
} from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { EpicRef } from '../../apis';

/** The slice of a GitHub issue the panel needs (roadmap backend REST shape). */
interface SubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  assignees: string[];
  repo?: string;
}

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    marginBottom: theme.spacing(2),
    padding: theme.spacing(1.5),
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  issueRef: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
}));

/**
 * The implementation issues of the plan's epic, from GitHub's sub-issue
 * hierarchy. Like EpicChip, the roadmap plugin's backend is queried directly
 * (instead of through its frontend API) to avoid coupling the plugin
 * packages; portals without the roadmap plugin render nothing via the
 * failed query.
 */
export function EpicSubIssues({ epic }: { epic: EpicRef }) {
  const classes = useStyles();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const { data: subIssues } = useQuery({
    queryKey: ['plans', 'epic-sub-issues', epic.owner, epic.repo, epic.number],
    queryFn: async (): Promise<SubIssue[]> => {
      const baseUrl = await discoveryApi.getBaseUrl('roadmap');
      const response = await fetchApi.fetch(
        `${baseUrl}/issues/${encodeURIComponent(epic.owner)}/${encodeURIComponent(epic.repo)}/${epic.number}/sub-issues`,
      );
      if (!response.ok) {
        throw new Error(
          `Sub-issue lookup failed with status ${response.status}`,
        );
      }
      return (await response.json()).subIssues;
    },
    retry: false,
    staleTime: 60_000,
  });

  if (!subIssues?.length) {
    return null;
  }

  const closed = subIssues.filter(issue => issue.state === 'closed').length;

  return (
    <Box className={classes.root}>
      <Box className={classes.header}>
        <Typography variant="subtitle2">Epic sub-issues</Typography>
        <Chip
          size="small"
          variant="outlined"
          label={`${closed}/${subIssues.length} done`}
        />
      </Box>
      <List dense disablePadding>
        {subIssues.map(issue => (
          <ListItem key={issue.id} disableGutters>
            <ListItemText
              primary={<Link to={issue.htmlUrl}>{issue.title}</Link>}
              secondary={
                <>
                  <Typography
                    component="span"
                    color="textSecondary"
                    className={classes.issueRef}
                  >
                    {issue.repo ?? `${epic.owner}/${epic.repo}`}#{issue.number}
                  </Typography>
                  {` · ${issue.state}`}
                  {issue.assignees.length > 0 &&
                    ` · ${issue.assignees.join(', ')}`}
                </>
              }
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
